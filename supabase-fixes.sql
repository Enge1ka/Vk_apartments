-- VK Apartments — CodeRabbit fixes
-- Run this once in the Supabase SQL Editor after the main schema.

-- ============================================================
-- SEQUENCES for atomic, collision-free ID generation
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS vkl_booking_seq;
CREATE SEQUENCE IF NOT EXISTS vkl_receipt_seq;

-- On an existing database, seed the sequences to the current year counts
-- so generated numbers continue from where count-based generation left off.
-- Uncomment and run these once, then remove them.
-- SELECT setval('vkl_booking_seq', COALESCE((SELECT COUNT(*) FROM bookings WHERE created_at >= date_trunc('year', now())), 0));
-- SELECT setval('vkl_receipt_seq', COALESCE((SELECT COUNT(*) FROM payments WHERE created_at >= date_trunc('year', now())), 0));

-- ============================================================
-- next_booking_ref() — returns the next VKL-YYYY-NNNN ref
-- ============================================================
CREATE OR REPLACE FUNCTION next_booking_ref()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 'VKL-' || EXTRACT(YEAR FROM CURRENT_DATE)::int
         || '-' || LPAD(nextval('vkl_booking_seq')::text, 4, '0');
$$;

-- ============================================================
-- record_payment() — atomically inserts a payment and updates
-- booking totals in a single transaction, preventing races.
-- ============================================================
-- Signature takes only the payment details; client_id and recorded_by are
-- derived server-side so callers cannot impersonate another user or client.
CREATE OR REPLACE FUNCTION record_payment(
  p_booking_id     uuid,
  p_amount         numeric,
  p_payment_date   date,
  p_payment_method text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking          record;
  v_caller_role      text;
  v_caller_location  uuid;
  v_booking_location uuid;
  v_receipt_num      text;
  v_new_paid         numeric;
  v_new_status       text;
BEGIN
  -- Resolve caller identity and role.
  SELECT role, location_id INTO v_caller_role, v_caller_location
  FROM profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found — access denied';
  END IF;

  -- Non-admin staff are restricted to their assigned location.
  IF v_caller_role != 'admin' THEN
    SELECT a.location_id INTO v_booking_location
    FROM bookings b
    JOIN apartments a ON a.id = b.apartment_id
    WHERE b.id = p_booking_id;

    IF v_booking_location IS DISTINCT FROM v_caller_location THEN
      RAISE EXCEPTION 'Not authorized to record payments for this booking';
    END IF;
  END IF;

  -- Lock the booking row so concurrent calls cannot over-collect.
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- outstanding_balance is a GENERATED ALWAYS column; read it directly.
  IF p_amount > v_booking.outstanding_balance THEN
    RAISE EXCEPTION 'Payment amount exceeds outstanding balance';
  END IF;

  -- Generate receipt number atomically.
  v_receipt_num := 'RCP-' || EXTRACT(YEAR FROM CURRENT_DATE)::int
                   || '-' || LPAD(nextval('vkl_receipt_seq')::text, 4, '0');

  -- Use identities from the booking row and the current JWT, not caller params.
  INSERT INTO payments (booking_id, client_id, amount, payment_date,
                        payment_method, receipt_number, recorded_by)
  VALUES (p_booking_id, v_booking.client_id, p_amount, p_payment_date,
          p_payment_method, v_receipt_num, auth.uid());

  v_new_paid   := COALESCE(v_booking.amount_paid, 0) + p_amount;
  v_new_status := CASE
    WHEN v_booking.total_amount - v_new_paid <= 0 THEN 'paid'
    WHEN v_new_paid > 0                           THEN 'partial'
    ELSE 'unpaid'
  END;

  -- Only update amount_paid and payment_status; outstanding_balance is computed
  -- automatically by Postgres as a GENERATED ALWAYS column.
  UPDATE bookings
  SET amount_paid    = v_new_paid,
      payment_status = v_new_status
  WHERE id = p_booking_id;

  RETURN json_build_object('receipt_number', v_receipt_num);
END;
$$;

GRANT EXECUTE ON FUNCTION next_booking_ref()                    TO authenticated;
GRANT EXECUTE ON FUNCTION record_payment(uuid,numeric,date,text) TO authenticated;
