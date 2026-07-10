-- VK Apartments — keep payment_status in sync when a booking's total changes
-- Run once in the Supabase SQL Editor after supabase-extend-stay.sql.
-- Idempotent (CREATE OR REPLACE).
--
-- Bug: refresh_booking_rollup() (called by extend_room, cancel_booking,
-- update_room_status, and auto_checkout_due_bookings) recomputes
-- bookings.total_amount but never touched payment_status. outstanding_balance
-- is a GENERATED column (total_amount - amount_paid), so it always reflects
-- the truth — but payment_status is a plain column last set by whichever
-- record_payment() call happened to run before the total last changed.
--
-- Concretely: a guest pays a booking in full (payment_status -> 'paid').
-- Staff later extend one of their rooms. total_amount goes up,
-- outstanding_balance (generated) correctly shows the new balance owed — but
-- the payment_status badge next to it still says PAID. Same risk in reverse
-- when cancelling a room drops total_amount below amount_paid: the badge
-- doesn't reflect the resulting credit.
--
-- Fix: refresh_booking_rollup() now recomputes payment_status too, using the
-- same rule record_payment() uses (paid when balance <= 0, partial when
-- something's been paid, else unpaid).

CREATE OR REPLACE FUNCTION refresh_booking_rollup(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total    numeric;
  v_min      date;
  v_max      date;
  v_live     integer;
  v_all_out  boolean;
  v_any_in   boolean;
  v_status   text;
  v_paid     numeric;
  v_pay_stat text;
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

  SELECT amount_paid INTO v_paid FROM bookings WHERE id = p_booking_id;
  v_paid := COALESCE(v_paid, 0);

  v_pay_stat := CASE
    WHEN COALESCE(v_total, 0) - v_paid <= 0 THEN 'paid'
    WHEN v_paid > 0                         THEN 'partial'
    ELSE 'unpaid'
  END;

  UPDATE bookings
  SET total_amount   = COALESCE(v_total, 0),
      check_in_date  = v_min,
      check_out_date = v_max,
      booking_status = v_status,
      payment_status = v_pay_stat,
      updated_at     = now()
  WHERE id = p_booking_id;
END;
$$;
