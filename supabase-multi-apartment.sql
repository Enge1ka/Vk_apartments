-- VK Apartments — combined multi-apartment bookings (line items)
-- Run this once in the Supabase SQL Editor after supabase-auto-checkout.sql.
-- TEST ON A STAGING PROJECT FIRST — this changes the shape of the bookings
-- table and backfills existing rows. It is wrapped in a transaction so a
-- failure rolls the whole thing back rather than leaving a half-migrated DB.
--
-- Model: a booking is now a header (client, one combined total, one balance,
-- one payment ledger, one booking_status) with one or more line items in the
-- new `booking_apartments` table — each an apartment with ITS OWN dates and
-- rate. One booking = one reference, one receipt listing every room.
--
-- Design decisions (see PR for rationale):
--  * Per-room dates & rate live on booking_apartments (authoritative).
--  * bookings.check_in_date/check_out_date are kept as a denormalised SPAN
--    (earliest room check-in, latest room check-out) so existing summary
--    queries — dashboard, calendar, reports date filters — keep working.
--  * booking_status stays at the booking level for now: checking the booking
--    in marks all its rooms occupied; auto-checkout closes it once the latest
--    room's checkout has passed. Per-room check-in/out is a possible later
--    enhancement.
--  * Overlap prevention moves to booking_apartments (per room). A cancelled
--    booking's rooms are marked inactive so their dates free up again.

BEGIN;

-- ============================================================
-- 1. Line-item table
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_apartments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  apartment_id   uuid NOT NULL REFERENCES apartments(id),
  check_in_date  date NOT NULL,
  check_out_date date NOT NULL,
  number_of_days integer GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  rate_per_day   numeric(10,2) NOT NULL,
  -- line_total is derived from base columns (a generated column may not
  -- reference another generated column, so recompute the nights here).
  line_total     numeric(10,2) GENERATED ALWAYS AS ((check_out_date - check_in_date) * rate_per_day) STORED,
  -- false once the parent booking is cancelled — keeps the row for audit
  -- while releasing its dates from the overlap constraint below.
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT booking_apartment_checkout_after_checkin CHECK (check_out_date > check_in_date),
  CONSTRAINT booking_apartment_positive_rate CHECK (rate_per_day > 0)
);

CREATE INDEX IF NOT EXISTS booking_apartments_booking_id_idx  ON booking_apartments (booking_id);
CREATE INDEX IF NOT EXISTS booking_apartments_apartment_id_idx ON booking_apartments (apartment_id);

-- Per-room overlap prevention (was on bookings). Only active rooms count, so a
-- cancelled booking frees its dates.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE booking_apartments
  DROP CONSTRAINT IF EXISTS no_overlapping_room_bookings;
ALTER TABLE booking_apartments
  ADD CONSTRAINT no_overlapping_room_bookings
  EXCLUDE USING gist (
    apartment_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
  ) WHERE (active);

-- ============================================================
-- 2. Backfill existing single-apartment bookings into line items
-- ============================================================
INSERT INTO booking_apartments (booking_id, apartment_id, check_in_date, check_out_date, rate_per_day, active)
SELECT b.id, b.apartment_id, b.check_in_date, b.check_out_date, b.rate_per_day,
       (b.booking_status <> 'cancelled')
FROM bookings b
WHERE b.apartment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM booking_apartments ba WHERE ba.booking_id = b.id);

-- ============================================================
-- 3. Retire the now-redundant per-apartment columns/constraints on bookings
--    (data is preserved in booking_apartments above). check_in_date /
--    check_out_date stay as the denormalised span.
-- ============================================================
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlapping_bookings;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_total_amount_matches_rate;
-- check_out_after_check_in still holds for the span and is harmless; leave it.

ALTER TABLE bookings DROP COLUMN IF EXISTS number_of_days;  -- generated; meaningless per-booking now
ALTER TABLE bookings DROP COLUMN IF EXISTS rate_per_day;    -- now per room
ALTER TABLE bookings DROP COLUMN IF EXISTS apartment_id;    -- now via booking_apartments

-- ============================================================
-- 4. booking_apartments RLS — same posture as the parent booking:
--    authenticated users read; writes go only through the RPCs below.
-- ============================================================
ALTER TABLE booking_apartments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_booking_apartments" ON booking_apartments;
CREATE POLICY "auth_read_booking_apartments" ON booking_apartments
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. create_booking_with_apartments() — atomic header + rooms insert
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking_with_apartments(
  p_client_id uuid,
  p_rooms     jsonb,   -- [{apartment_id, check_in_date, check_out_date, rate_per_day}, ...]
  p_notes     text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role     text;
  v_caller_location uuid;
  v_booking_id      uuid;
  v_ref             text;
  v_room            jsonb;
  v_apt_location    uuid;
  v_total           numeric;
  v_min_in          date;
  v_max_out         date;
BEGIN
  SELECT role, location_id INTO v_caller_role, v_caller_location
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found — access denied';
  END IF;

  IF p_rooms IS NULL OR jsonb_array_length(p_rooms) = 0 THEN
    RAISE EXCEPTION 'At least one apartment is required';
  END IF;

  v_ref := next_booking_ref();

  INSERT INTO bookings (booking_reference, client_id, total_amount, amount_paid,
                        payment_status, booking_status, notes, created_by)
  VALUES (v_ref, p_client_id, 0, 0, 'unpaid', 'confirmed', p_notes, auth.uid())
  RETURNING id INTO v_booking_id;

  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    -- Non-admins may only book apartments in their assigned location.
    IF v_caller_role <> 'admin' THEN
      SELECT location_id INTO v_apt_location
      FROM apartments WHERE id = (v_room->>'apartment_id')::uuid;
      IF v_apt_location IS DISTINCT FROM v_caller_location THEN
        RAISE EXCEPTION 'Not authorized to book an apartment outside your location';
      END IF;
    END IF;

    INSERT INTO booking_apartments (booking_id, apartment_id, check_in_date, check_out_date, rate_per_day)
    VALUES (
      v_booking_id,
      (v_room->>'apartment_id')::uuid,
      (v_room->>'check_in_date')::date,
      (v_room->>'check_out_date')::date,
      (v_room->>'rate_per_day')::numeric
    );
  END LOOP;

  SELECT COALESCE(sum(line_total), 0), min(check_in_date), max(check_out_date)
  INTO v_total, v_min_in, v_max_out
  FROM booking_apartments WHERE booking_id = v_booking_id;

  UPDATE bookings
  SET total_amount = v_total, check_in_date = v_min_in, check_out_date = v_max_out
  WHERE id = v_booking_id;

  RETURN json_build_object('booking_id', v_booking_id, 'booking_reference', v_ref);
EXCEPTION
  WHEN exclusion_violation THEN
    -- Whole transaction (header + rooms) rolls back automatically.
    RAISE EXCEPTION 'One of the selected apartments is already booked for those dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION create_booking_with_apartments(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_booking_with_apartments(uuid, jsonb, text) TO authenticated;

-- ============================================================
-- 6. update_booking_status() — sync ALL of a booking's rooms
-- ============================================================
CREATE OR REPLACE FUNCTION update_booking_status(
  p_booking_id uuid,
  p_new_status text,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role     text;
  v_caller_location uuid;
  v_new_apt_status  text;
  v_off_location    boolean;
BEGIN
  SELECT role, location_id INTO v_caller_role, v_caller_location
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found — access denied';
  END IF;

  IF p_new_status NOT IN ('confirmed', 'checked_in', 'checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid booking status: %', p_new_status;
  END IF;

  IF p_new_status = 'cancelled' AND v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can cancel bookings';
  END IF;

  -- Lock the booking row.
  PERFORM 1 FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  -- Non-admins may only touch a booking whose rooms are all in their location.
  IF v_caller_role <> 'admin' THEN
    SELECT bool_or(a.location_id IS DISTINCT FROM v_caller_location) INTO v_off_location
    FROM booking_apartments ba JOIN apartments a ON a.id = ba.apartment_id
    WHERE ba.booking_id = p_booking_id;
    IF COALESCE(v_off_location, true) THEN
      RAISE EXCEPTION 'Not authorized to update this booking';
    END IF;
  END IF;

  v_new_apt_status := CASE
    WHEN p_new_status = 'checked_in' THEN 'occupied'
    WHEN p_new_status IN ('checked_out', 'cancelled') THEN 'available'
    ELSE NULL
  END;

  IF v_new_apt_status IS NOT NULL THEN
    UPDATE apartments SET status = v_new_apt_status
    WHERE id IN (SELECT apartment_id FROM booking_apartments WHERE booking_id = p_booking_id);
  END IF;

  -- Cancelling frees the rooms' dates from the overlap constraint.
  IF p_new_status = 'cancelled' THEN
    UPDATE booking_apartments SET active = false WHERE booking_id = p_booking_id;
  END IF;

  UPDATE bookings
  SET booking_status = p_new_status,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_booking_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_booking_status(uuid, text, text) TO authenticated;

-- ============================================================
-- 7. auto_checkout_due_bookings() — release ALL rooms of a due booking
--    (redefined for the line-item model; supersedes the version in
--    supabase-auto-checkout.sql). The daily 10:00 cron job calls this.
-- ============================================================
CREATE OR REPLACE FUNCTION auto_checkout_due_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Africa/Lusaka')::date;
  v_ids     uuid[];
BEGIN
  -- A booking is due out once its LAST room checkout has passed
  -- (bookings.check_out_date holds that span maximum).
  WITH closed AS (
    UPDATE bookings
    SET booking_status = 'checked_out',
        updated_at     = now(),
        notes          = COALESCE(notes || E'\n', '')
                         || 'Auto-checked-out on ' || v_today || ' (10:00 checkout time)'
    WHERE booking_status = 'checked_in'
      AND check_out_date <= v_today
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM closed;

  IF v_ids IS NOT NULL THEN
    UPDATE apartments a
    SET status = 'available'
    WHERE a.status = 'occupied'
      AND a.id IN (SELECT apartment_id FROM booking_apartments WHERE booking_id = ANY (v_ids))
      AND NOT EXISTS (
        SELECT 1
        FROM booking_apartments ba JOIN bookings b ON b.id = ba.booking_id
        WHERE ba.apartment_id = a.id AND b.booking_status = 'checked_in'
      );
  END IF;

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION auto_checkout_due_bookings() FROM PUBLIC;

COMMIT;

-- Reminder: add booking_apartments to the realtime publication if you want
-- calendar/dashboard live updates on room-level changes:
--   ALTER PUBLICATION supabase_realtime ADD TABLE booking_apartments;
