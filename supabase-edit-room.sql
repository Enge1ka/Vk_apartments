-- VK Apartments — edit a not-yet-checked-in room
-- Run once in the Supabase SQL Editor after supabase-refunds-shorten.sql.
-- Idempotent (CREATE OR REPLACE).
--
-- extend_room / shorten_room only move the CHECK-OUT of a live stay. This fills
-- the remaining gap: correcting a mistake on a room that hasn't started yet —
-- wrong check-in date, wrong check-out, or wrong rate — without the
-- cancel-and-rebook dance. Deliberately limited to 'confirmed' rooms: once a
-- guest is checked in, editing their check-in date is meaningless and
-- extend/shorten are the right tools for the check-out. The per-room overlap
-- constraint still guards against moving a room onto dates another booking holds.

CREATE OR REPLACE FUNCTION edit_room(
  p_booking_apartment_id uuid,
  p_check_in_date        date,
  p_check_out_date       date,
  p_rate_per_day         numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role     text;
  v_location uuid;
  v_room     record;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;

  SELECT ba.booking_id, ba.status, a.location_id AS apt_location
    INTO v_room
  FROM booking_apartments ba JOIN apartments a ON a.id = ba.apartment_id
  WHERE ba.id = p_booking_apartment_id
  FOR UPDATE OF ba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_booking_apartment_id; END IF;

  IF v_role <> 'admin' AND v_room.apt_location IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'Not authorized to change this room';
  END IF;

  IF v_room.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a not-yet-checked-in room can be edited; use extend or shorten instead';
  END IF;

  IF p_check_out_date <= p_check_in_date THEN
    RAISE EXCEPTION 'Check-out must be after check-in';
  END IF;
  IF p_rate_per_day <= 0 THEN
    RAISE EXCEPTION 'Rate per day must be greater than 0';
  END IF;

  UPDATE booking_apartments
  SET check_in_date  = p_check_in_date,
      check_out_date = p_check_out_date,
      rate_per_day   = p_rate_per_day,
      updated_at     = now()
  WHERE id = p_booking_apartment_id;

  PERFORM refresh_booking_rollup(v_room.booking_id);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'That apartment is already booked for those dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION edit_room(uuid, date, date, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION edit_room(uuid, date, date, numeric) TO authenticated;
