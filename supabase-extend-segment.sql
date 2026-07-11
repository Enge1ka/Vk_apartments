-- VK Apartments — extend a stay at a new rate (as a contiguous segment)
-- Run once in the Supabase SQL Editor after supabase-refunds-shorten.sql.
-- Idempotent (CREATE OR REPLACE).
--
-- extend_room() moves the check-out and (optionally) re-prices the WHOLE room.
-- This is the other option a guest may want: keep the nights already agreed at
-- their original price and bill only the EXTRA nights at a new rate. Because a
-- booking is line items and the overlap constraint uses half-open ranges, that
-- needs no new pricing model — it's just a second room row on the SAME
-- apartment, starting exactly where the first ends. The rollup sums them, the
-- receipt itemises them, and the apartment stays continuously held.
--
-- The new segment copies the source room's status (a checked-in guest's
-- extension is itself checked_in, so sync_apartment_status keeps the unit held
-- when the first segment auto-checks-out on its own end date).

CREATE OR REPLACE FUNCTION extend_room_new_rate(
  p_booking_apartment_id uuid,
  p_new_check_out_date   date,
  p_rate_per_day         numeric
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role     text;
  v_location uuid;
  v_room     record;
  v_new_id   uuid;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;

  SELECT ba.booking_id, ba.apartment_id, ba.check_out_date, ba.status, a.location_id AS apt_location
    INTO v_room
  FROM booking_apartments ba JOIN apartments a ON a.id = ba.apartment_id
  WHERE ba.id = p_booking_apartment_id
  FOR UPDATE OF ba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_booking_apartment_id; END IF;

  IF v_role <> 'admin' AND v_room.apt_location IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'Not authorized to change this room';
  END IF;
  IF v_room.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot extend a % room', v_room.status;
  END IF;
  IF p_new_check_out_date <= v_room.check_out_date THEN
    RAISE EXCEPTION 'New check-out must be later than the current one (%)', v_room.check_out_date;
  END IF;
  IF p_rate_per_day <= 0 THEN
    RAISE EXCEPTION 'Rate per day must be greater than 0';
  END IF;

  -- The extension segment: same apartment, starting where the current stay
  -- ends. Half-open ranges make [.., check_out) and [check_out, new) contiguous
  -- but non-overlapping, so the exclusion constraint accepts it here yet still
  -- rejects a collision with a different booking.
  INSERT INTO booking_apartments (booking_id, apartment_id, check_in_date, check_out_date, rate_per_day, status)
  VALUES (v_room.booking_id, v_room.apartment_id, v_room.check_out_date, p_new_check_out_date, p_rate_per_day, v_room.status)
  RETURNING id INTO v_new_id;

  PERFORM refresh_booking_rollup(v_room.booking_id);
  RETURN json_build_object('booking_apartment_id', v_new_id);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'That apartment is already booked for the extended dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION extend_room_new_rate(uuid, date, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION extend_room_new_rate(uuid, date, numeric) TO authenticated;
