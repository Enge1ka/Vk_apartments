-- VK Apartments — refunds and shorten-stay
-- Run once in the Supabase SQL Editor after supabase-payment-status-rollup-fix.sql.
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE).
--
-- Adds two money-flow gaps:
--
--  #1 Refunds — the payments ledger only held positive payments, so a
--     cancelled-after-paid booking left a negative outstanding_balance (a
--     credit owed) with no way to record returning the money. record_refund()
--     writes a refund row (payment_type = 'refund') and decrements amount_paid,
--     so the ledger stays the source of truth and the balance settles back to
--     zero. Admin-only, since it moves money out.
--
--  #2 Shorten stay — the mirror of extend_room(): move a room's check-out
--     EARLIER (guest leaves early). The line total drops and the booking
--     rolls up; if they'd overpaid, that surfaces as a credit to refund.

-- ============================================================
-- payments.payment_type — distinguishes a refund from a payment
-- ============================================================
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'payment';
-- Drop-and-add so re-running doesn't error on an existing constraint.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('payment', 'refund'));

CREATE SEQUENCE IF NOT EXISTS vkl_refund_seq;

-- ============================================================
-- record_refund() — admin-only; records money returned to the guest
-- ============================================================
CREATE OR REPLACE FUNCTION record_refund(
  p_booking_id     uuid,
  p_amount         numeric,
  p_payment_date   date,
  p_payment_method text,
  p_reason         text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        text;
  v_booking     record;
  v_receipt     text;
  v_new_paid    numeric;
  v_new_status  text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Only admins can record refunds'; END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking % not found', p_booking_id; END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'Refund amount must be positive'; END IF;
  IF p_amount > COALESCE(v_booking.amount_paid, 0) THEN
    RAISE EXCEPTION 'Refund exceeds the amount paid (%)', COALESCE(v_booking.amount_paid, 0);
  END IF;

  v_receipt := 'RFD-' || EXTRACT(YEAR FROM CURRENT_DATE)::int
               || '-' || LPAD(nextval('vkl_refund_seq')::text, 4, '0');

  INSERT INTO payments (booking_id, client_id, amount, payment_date,
                        payment_method, receipt_number, recorded_by, payment_type, notes)
  VALUES (p_booking_id, v_booking.client_id, p_amount, p_payment_date,
          p_payment_method, v_receipt, auth.uid(), 'refund', p_reason);

  v_new_paid := COALESCE(v_booking.amount_paid, 0) - p_amount;
  v_new_status := CASE
    WHEN v_booking.total_amount - v_new_paid <= 0 THEN 'paid'
    WHEN v_new_paid > 0                           THEN 'partial'
    ELSE 'unpaid'
  END;

  UPDATE bookings SET amount_paid = v_new_paid, payment_status = v_new_status
  WHERE id = p_booking_id;

  RETURN json_build_object('receipt_number', v_receipt);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_refund(uuid, numeric, date, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_refund(uuid, numeric, date, text, text) TO authenticated;

-- ============================================================
-- shorten_room() — move a room's check-out earlier
-- ============================================================
CREATE OR REPLACE FUNCTION shorten_room(
  p_booking_apartment_id uuid,
  p_new_check_out_date   date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role     text;
  v_location uuid;
  v_room     record;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;

  SELECT ba.booking_id, ba.check_in_date, ba.check_out_date, ba.status, a.location_id AS apt_location
    INTO v_room
  FROM booking_apartments ba JOIN apartments a ON a.id = ba.apartment_id
  WHERE ba.id = p_booking_apartment_id
  FOR UPDATE OF ba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_booking_apartment_id; END IF;

  IF v_role <> 'admin' AND v_room.apt_location IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'Not authorized to change this room';
  END IF;

  IF v_room.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot shorten a % room', v_room.status;
  END IF;

  IF p_new_check_out_date >= v_room.check_out_date THEN
    RAISE EXCEPTION 'New check-out date must be earlier than the current one (%)', v_room.check_out_date;
  END IF;

  IF p_new_check_out_date <= v_room.check_in_date THEN
    RAISE EXCEPTION 'A stay must be at least one night (check-out after check-in)';
  END IF;

  UPDATE booking_apartments
  SET check_out_date = p_new_check_out_date, updated_at = now()
  WHERE id = p_booking_apartment_id;

  PERFORM refresh_booking_rollup(v_room.booking_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION shorten_room(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION shorten_room(uuid, date) TO authenticated;
