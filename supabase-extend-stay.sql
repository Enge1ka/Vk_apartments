-- VK Apartments — extend a room's stay
-- Run once in the Supabase SQL Editor after supabase-multi-apartment.sql.
-- Idempotent (CREATE OR REPLACE).
--
-- extend_room() moves a room's check-out date later (an extension) and,
-- optionally, sets a new nightly rate. The rate defaults to the room's current
-- rate; passing a new rate re-prices that room's whole stay. The booking's
-- combined total and outstanding balance update automatically (via
-- refresh_booking_rollup), and the per-room overlap constraint blocks
-- extending into dates another booking already holds. A checked-out or
-- cancelled room can't be extended.

CREATE OR REPLACE FUNCTION extend_room(
  p_booking_apartment_id uuid,
  p_new_check_out_date   date,
  p_rate_per_day         numeric DEFAULT NULL   -- NULL = keep the current rate
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role     text;
  v_location uuid;
  v_room     record;
  v_rate     numeric;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;

  SELECT ba.booking_id, ba.check_in_date, ba.check_out_date, ba.rate_per_day, ba.status,
         a.location_id AS apt_location
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
    RAISE EXCEPTION 'New check-out date must be later than the current one (%)', v_room.check_out_date;
  END IF;

  v_rate := COALESCE(p_rate_per_day, v_room.rate_per_day);
  IF v_rate <= 0 THEN RAISE EXCEPTION 'Rate per day must be greater than 0'; END IF;

  UPDATE booking_apartments
  SET check_out_date = p_new_check_out_date,
      rate_per_day   = v_rate,
      updated_at     = now()
  WHERE id = p_booking_apartment_id;

  PERFORM refresh_booking_rollup(v_room.booking_id);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'That apartment is already booked for the extended dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION extend_room(uuid, date, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION extend_room(uuid, date, numeric) TO authenticated;
