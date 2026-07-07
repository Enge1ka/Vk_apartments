-- VK Apartments — combined multi-apartment bookings (per-room line items)
-- Run this once in the Supabase SQL Editor after supabase-auto-checkout.sql.
-- TEST ON A STAGING PROJECT FIRST — this reshapes the bookings table and
-- backfills existing rows. Wrapped in a transaction: any failure rolls the
-- whole migration back rather than leaving a half-migrated database.
--
-- Model: a booking is a header (client, one combined total, one balance, one
-- payment ledger, one receipt) with one or more rooms in booking_apartments.
-- Each room has ITS OWN dates, rate, AND status — it checks in/out and is
-- auto-checked-out on its own schedule. The header's booking_status is a
-- rollup of its rooms, kept so existing list filters/badges keep working:
--   * all rooms cancelled          -> cancelled
--   * any room checked_in          -> checked_in
--   * all live rooms checked_out    -> checked_out
--   * otherwise                     -> confirmed
-- bookings.check_in_date/check_out_date are kept as the span (earliest live
-- room in, latest live room out) so summary queries keep working.

BEGIN;

-- ============================================================
-- 1. Line-item table (per-room dates, rate, status)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_apartments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  apartment_id   uuid NOT NULL REFERENCES apartments(id),
  check_in_date  date NOT NULL,
  check_out_date date NOT NULL,
  number_of_days integer GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  rate_per_day   numeric(10,2) NOT NULL,
  line_total     numeric(10,2) GENERATED ALWAYS AS ((check_out_date - check_in_date) * rate_per_day) STORED,
  status         text NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('confirmed','checked_in','checked_out','cancelled')),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  CONSTRAINT ba_checkout_after_checkin CHECK (check_out_date > check_in_date),
  CONSTRAINT ba_positive_rate CHECK (rate_per_day > 0)
);

CREATE INDEX IF NOT EXISTS booking_apartments_booking_id_idx   ON booking_apartments (booking_id);
CREATE INDEX IF NOT EXISTS booking_apartments_apartment_id_idx ON booking_apartments (apartment_id);

-- Per-room overlap prevention. A cancelled room frees its dates (status is on
-- this table, so the predicate can reference it directly).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE booking_apartments DROP CONSTRAINT IF EXISTS no_overlapping_room_bookings;
ALTER TABLE booking_apartments
  ADD CONSTRAINT no_overlapping_room_bookings
  EXCLUDE USING gist (
    apartment_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
  ) WHERE (status <> 'cancelled');

-- ============================================================
-- 2. Backfill existing bookings (each becomes one room, same status)
-- ============================================================
INSERT INTO booking_apartments (booking_id, apartment_id, check_in_date, check_out_date, rate_per_day, status)
SELECT b.id, b.apartment_id, b.check_in_date, b.check_out_date, b.rate_per_day, b.booking_status
FROM bookings b
WHERE b.apartment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM booking_apartments ba WHERE ba.booking_id = b.id);

-- ============================================================
-- 3. Retire the now per-room columns/constraints on the bookings header
-- ============================================================
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlapping_bookings;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_total_amount_matches_rate;
ALTER TABLE bookings DROP COLUMN IF EXISTS number_of_days;
ALTER TABLE bookings DROP COLUMN IF EXISTS rate_per_day;
ALTER TABLE bookings DROP COLUMN IF EXISTS apartment_id;

-- ============================================================
-- 4. RLS: authenticated read; writes only via the RPCs below
-- ============================================================
ALTER TABLE booking_apartments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_booking_apartments" ON booking_apartments;
CREATE POLICY "auth_read_booking_apartments" ON booking_apartments
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. Helpers
-- ============================================================
-- Set an apartment occupied iff it has any checked-in room right now; else
-- free it. Never touches a 'maintenance' apartment.
CREATE OR REPLACE FUNCTION sync_apartment_status(p_apartment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_apartments WHERE apartment_id = p_apartment_id AND status = 'checked_in') THEN
    UPDATE apartments SET status = 'occupied' WHERE id = p_apartment_id AND status <> 'maintenance';
  ELSE
    UPDATE apartments SET status = 'available' WHERE id = p_apartment_id AND status = 'occupied';
  END IF;
END;
$$;

-- Recompute the header totals/span/status from its rooms.
CREATE OR REPLACE FUNCTION refresh_booking_rollup(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total   numeric;
  v_min     date;
  v_max     date;
  v_live    integer;
  v_all_out boolean;
  v_any_in  boolean;
  v_status  text;
BEGIN
  SELECT COALESCE(sum(line_total) FILTER (WHERE status <> 'cancelled'), 0),
         min(check_in_date)  FILTER (WHERE status <> 'cancelled'),
         max(check_out_date) FILTER (WHERE status <> 'cancelled'),
         count(*)            FILTER (WHERE status <> 'cancelled'),
         bool_and(status = 'checked_out') FILTER (WHERE status <> 'cancelled'),
         bool_or(status = 'checked_in')
    INTO v_total, v_min, v_max, v_live, v_all_out, v_any_in
  FROM booking_apartments WHERE booking_id = p_booking_id;

  v_status := CASE
    WHEN v_live = 0        THEN 'cancelled'
    WHEN v_any_in          THEN 'checked_in'
    WHEN v_all_out         THEN 'checked_out'
    ELSE 'confirmed'
  END;

  UPDATE bookings
  SET total_amount   = COALESCE(v_total, 0),
      check_in_date  = v_min,
      check_out_date = v_max,
      booking_status = v_status,
      updated_at     = now()
  WHERE id = p_booking_id;
END;
$$;

-- ============================================================
-- 6. create_booking_with_apartments() — atomic header + rooms
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking_with_apartments(
  p_client_id uuid,
  p_rooms     jsonb,   -- [{apartment_id, check_in_date, check_out_date, rate_per_day}, ...]
  p_notes     text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role     text;
  v_location uuid;
  v_booking  uuid;
  v_ref      text;
  v_room     jsonb;
  v_apt_loc  uuid;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;
  IF p_rooms IS NULL OR jsonb_array_length(p_rooms) = 0 THEN
    RAISE EXCEPTION 'At least one apartment is required';
  END IF;

  v_ref := next_booking_ref();

  INSERT INTO bookings (booking_reference, client_id, total_amount, amount_paid,
                        payment_status, booking_status, notes, created_by)
  VALUES (v_ref, p_client_id, 0, 0, 'unpaid', 'confirmed', p_notes, auth.uid())
  RETURNING id INTO v_booking;

  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    IF v_role <> 'admin' THEN
      SELECT location_id INTO v_apt_loc FROM apartments WHERE id = (v_room->>'apartment_id')::uuid;
      IF v_apt_loc IS DISTINCT FROM v_location THEN
        RAISE EXCEPTION 'Not authorized to book an apartment outside your location';
      END IF;
    END IF;

    INSERT INTO booking_apartments (booking_id, apartment_id, check_in_date, check_out_date, rate_per_day)
    VALUES (
      v_booking,
      (v_room->>'apartment_id')::uuid,
      (v_room->>'check_in_date')::date,
      (v_room->>'check_out_date')::date,
      (v_room->>'rate_per_day')::numeric
    );
  END LOOP;

  PERFORM refresh_booking_rollup(v_booking);
  RETURN json_build_object('booking_id', v_booking, 'booking_reference', v_ref);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'One of the selected apartments is already booked for those dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION create_booking_with_apartments(uuid, jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION create_booking_with_apartments(uuid, jsonb, text) TO authenticated;

-- ============================================================
-- 7. update_room_status() — per-room check-in/out
-- ============================================================
CREATE OR REPLACE FUNCTION update_room_status(
  p_booking_apartment_id uuid,
  p_new_status           text,
  p_notes                text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role     text;
  v_location uuid;
  v_apt      uuid;
  v_apt_loc  uuid;
  v_booking  uuid;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;
  IF p_new_status NOT IN ('confirmed','checked_in','checked_out','cancelled') THEN
    RAISE EXCEPTION 'Invalid room status: %', p_new_status;
  END IF;
  IF p_new_status = 'cancelled' AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can cancel';
  END IF;

  SELECT ba.apartment_id, ba.booking_id, a.location_id
    INTO v_apt, v_booking, v_apt_loc
  FROM booking_apartments ba JOIN apartments a ON a.id = ba.apartment_id
  WHERE ba.id = p_booking_apartment_id
  FOR UPDATE OF ba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_booking_apartment_id; END IF;

  IF v_role <> 'admin' AND v_apt_loc IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'Not authorized to update this room';
  END IF;

  UPDATE booking_apartments SET status = p_new_status, updated_at = now()
  WHERE id = p_booking_apartment_id;

  PERFORM sync_apartment_status(v_apt);
  PERFORM refresh_booking_rollup(v_booking);

  IF p_notes IS NOT NULL THEN
    UPDATE bookings SET notes = COALESCE(notes || E'\n', '') || p_notes WHERE id = v_booking;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_room_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_room_status(uuid, text, text) TO authenticated;

-- ============================================================
-- 8. cancel_booking() — admin-only, cancels every room at once
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_apt  uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Only admins can cancel bookings'; END IF;

  UPDATE booking_apartments SET status = 'cancelled', updated_at = now()
  WHERE booking_id = p_booking_id AND status <> 'cancelled';

  FOR v_apt IN SELECT DISTINCT apartment_id FROM booking_apartments WHERE booking_id = p_booking_id
  LOOP
    PERFORM sync_apartment_status(v_apt);
  END LOOP;

  PERFORM refresh_booking_rollup(p_booking_id);

  IF p_notes IS NOT NULL THEN
    UPDATE bookings SET notes = COALESCE(notes || E'\n', '') || p_notes WHERE id = p_booking_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_booking(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cancel_booking(uuid, text) TO authenticated;

-- The old booking-level update_booking_status() is superseded by
-- update_room_status()/cancel_booking(); leave it in place (harmless) or drop
-- it once the app no longer calls it.

-- ============================================================
-- 9. auto_checkout_due_bookings() — per room, at 10:00 CAT (cron from
--    supabase-auto-checkout.sql calls this). Checks out each room whose own
--    checkout date has passed and frees its apartment.
-- ============================================================
CREATE OR REPLACE FUNCTION auto_checkout_due_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Lusaka')::date;
  v_apt   uuid;
  v_bk    uuid;
  v_count integer := 0;
BEGIN
  FOR v_apt, v_bk IN
    WITH closed AS (
      UPDATE booking_apartments SET status = 'checked_out', updated_at = now()
      WHERE status = 'checked_in' AND check_out_date <= v_today
      RETURNING apartment_id, booking_id
    )
    SELECT apartment_id, booking_id FROM closed
  LOOP
    v_count := v_count + 1;
    PERFORM sync_apartment_status(v_apt);
    PERFORM refresh_booking_rollup(v_bk);
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION auto_checkout_due_bookings() FROM PUBLIC;

COMMIT;

-- Optional: room-level realtime for live calendar/dashboard updates:
--   ALTER PUBLICATION supabase_realtime ADD TABLE booking_apartments;
