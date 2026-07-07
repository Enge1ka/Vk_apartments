-- VK Apartments — automatic check-out at 10:00 (Africa/Lusaka)
-- Run this once in the Supabase SQL Editor after supabase-rls-tightening.sql.
-- Safe to re-run (idempotent).
--
-- Checkout time is 10:00. Each morning at 10:00 CAT this flips any guest who
-- is still `checked_in` and whose check_out_date has arrived to
-- `checked_out`, and releases their apartment back to `available` — mirroring
-- exactly what update_booking_status('checked_out') does when a staff member
-- checks a guest out by hand, just done automatically.
--
-- Deliberately does NOT auto-check-IN: a guest who hasn't physically arrived
-- shouldn't be marked in-house, and a no-show shouldn't silently occupy a
-- unit. Only bookings a staff member actually checked in are auto-closed.
-- `confirmed` bookings that were never checked in are left untouched.

-- pg_cron ships with Supabase but may need enabling once. If this CREATE
-- errors, enable "pg_cron" under Dashboard -> Database -> Extensions, then
-- re-run this file.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- auto_checkout_due_bookings() — returns how many bookings it closed
-- ============================================================
CREATE OR REPLACE FUNCTION auto_checkout_due_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- "Today" in Zambia, not UTC, so a 10:00 CAT run uses the local calendar
  -- date (the same class of bug the client-side timezone fix addressed).
  v_today         date := (now() AT TIME ZONE 'Africa/Lusaka')::date;
  v_apartment_ids uuid[];
BEGIN
  -- Close every checked-in booking whose checkout date has arrived, and
  -- collect the apartments they were holding.
  WITH closed AS (
    UPDATE bookings
    SET booking_status = 'checked_out',
        updated_at     = now(),
        notes          = COALESCE(notes || E'\n', '')
                         || 'Auto-checked-out on ' || v_today || ' (10:00 checkout time)'
    WHERE booking_status = 'checked_in'
      AND check_out_date <= v_today
    RETURNING apartment_id
  )
  SELECT array_agg(apartment_id) INTO v_apartment_ids FROM closed;

  -- Release those apartments — but only if no OTHER booking is still checked
  -- in to the same unit (e.g. a same-day turnover already checked in), so we
  -- never free a room that's genuinely occupied.
  IF v_apartment_ids IS NOT NULL THEN
    UPDATE apartments a
    SET status = 'available'
    WHERE a.id = ANY (v_apartment_ids)
      AND a.status = 'occupied'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.apartment_id = a.id
          AND b.booking_status = 'checked_in'
      );
  END IF;

  RETURN COALESCE(array_length(v_apartment_ids, 1), 0);
END;
$$;

-- Staff-only: keep it off the anon/public grant (nothing calls it from the
-- client anyway; cron runs it as the table owner).
REVOKE EXECUTE ON FUNCTION auto_checkout_due_bookings() FROM PUBLIC;

-- ============================================================
-- Schedule it for 10:00 Africa/Lusaka == 08:00 UTC (pg_cron runs in UTC)
-- ============================================================
-- Drop any previous copy of this job first so re-running the file doesn't
-- stack duplicate schedules.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vk-auto-checkout-10am-cat') THEN
    PERFORM cron.unschedule('vk-auto-checkout-10am-cat');
  END IF;
END $$;

SELECT cron.schedule(
  'vk-auto-checkout-10am-cat',
  '0 8 * * *',                       -- 08:00 UTC = 10:00 CAT, daily
  $$SELECT auto_checkout_due_bookings();$$
);

-- To verify later:
--   SELECT * FROM cron.job WHERE jobname = 'vk-auto-checkout-10am-cat';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
-- To run it once immediately (e.g. to clear a backlog): SELECT auto_checkout_due_bookings();
