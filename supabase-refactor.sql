-- VK Apartments — architecture refactor migration
-- Run this once in the Supabase SQL Editor after supabase-schema.sql and
-- supabase-fixes.sql. See docs/database.md for the full schema reference.
--
-- Fixes two real bugs found during the architecture audit:
--
-- 1. Booking status transitions (check-in / check-out / cancel) previously did
--    two separate, unguarded UPDATE statements from the client: one on
--    `bookings`, one on `apartments`. If the second failed (network drop,
--    RLS denial, etc.) the booking and apartment status would desync —
--    e.g. a booking marked "checked_out" while its apartment stayed
--    "occupied" forever. update_booking_status() below fixes this the same
--    way record_payment() already fixes payment recording: lock the booking
--    row, make both writes in one transaction, and check authorization
--    server-side instead of relying on the UI hiding the "Cancelled" option.
--    (That UI-only gating meant any authenticated, non-admin user could
--    previously cancel a booking by calling the update directly — RLS only
--    checked `true` for booking updates, not role or location.)
--
-- 2. Nothing prevented two staff members from creating overlapping bookings
--    for the same apartment if they both passed the client-side overlap
--    check at the same moment (check-then-insert race). The EXCLUDE
--    constraint below makes the database itself reject the second insert,
--    no matter how the race plays out.

-- ============================================================
-- update_booking_status() — atomic booking + apartment status sync
-- ============================================================
CREATE OR REPLACE FUNCTION update_booking_status(
  p_booking_id uuid,
  p_new_status text,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking          record;
  v_caller_role      text;
  v_caller_location  uuid;
  v_new_apt_status   text;
BEGIN
  SELECT role, location_id INTO v_caller_role, v_caller_location
  FROM profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found — access denied';
  END IF;

  IF p_new_status NOT IN ('confirmed', 'checked_in', 'checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid booking status: %', p_new_status;
  END IF;

  -- Cancellation was previously only hidden from non-admins in the UI;
  -- enforce it server-side now.
  IF p_new_status = 'cancelled' AND v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can cancel bookings';
  END IF;

  -- Lock the booking row so a concurrent status change can't interleave
  -- with this one (mirrors record_payment's locking pattern).
  SELECT b.*, a.location_id AS apartment_location_id INTO v_booking
  FROM bookings b
  JOIN apartments a ON a.id = b.apartment_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  IF v_caller_role != 'admin' AND v_booking.apartment_location_id IS DISTINCT FROM v_caller_location THEN
    RAISE EXCEPTION 'Not authorized to update this booking';
  END IF;

  v_new_apt_status := CASE
    WHEN p_new_status = 'checked_in' THEN 'occupied'
    WHEN p_new_status IN ('checked_out', 'cancelled') THEN 'available'
    ELSE NULL
  END;

  IF v_new_apt_status IS NOT NULL THEN
    UPDATE apartments SET status = v_new_apt_status WHERE id = v_booking.apartment_id;
  END IF;

  UPDATE bookings
  SET booking_status = p_new_status,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_booking_status(uuid, text, text) TO authenticated;

-- ============================================================
-- Prevent overlapping bookings for the same apartment at the DB level
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    apartment_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
  ) WHERE (booking_status != 'cancelled');
