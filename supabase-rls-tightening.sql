-- VK Apartments — RLS tightening + remaining SECURITY DEFINER hardening
-- Run this once in the Supabase SQL Editor after
-- supabase-search-path-hardening.sql. Safe to re-run (idempotent).
--
-- Closes gaps found in the audit:
--
--  H2. The permissive write policies let any authenticated user bypass the
--      hardened RPCs via PostgREST:
--        * auth_update_bookings USING (true) — a non-admin could PATCH a
--          booking directly to cancel it (the RPC's admin-only rule is
--          bypassed), or set amount_paid/payment_status to "paid" with no
--          payment row behind it, or edit dates/rates at any location.
--        * auth_insert_payments WITH CHECK (true) — direct inserts with an
--          arbitrary amount, receipt_number, client_id, and a forged
--          recorded_by, defeating record_payment()'s over-collection and
--          impersonation guards.
--      The app never uses these paths — every booking/payment write goes
--      through createBooking()/record_payment()/update_booking_status().
--      So we drop the direct UPDATE-bookings and INSERT-payments policies
--      (the SECURITY DEFINER RPCs don't need a table policy to write), and
--      constrain INSERT on bookings to a fresh, unpaid, self-owned row so
--      the create path can't be abused to forge financial state.
--
--  M3. handle_new_user() was never actually search_path-pinned (the
--      search-path-hardening migration's comment claimed it was). Pin it.
--
--  M4. log_client_metric() is anon-callable by design (pre-auth web vitals)
--      but had no payload cap — an unlimited free-form jsonb insert vector.
--      Add a light server-side size guard. (Rate limiting and retention are
--      still worth adding at the edge / via a scheduled purge.)

-- ============================================================
-- H2 — remove the RPC-bypassing table write policies
-- ============================================================

-- Bookings: no direct client UPDATE. Status/notes changes go through
-- update_booking_status(); nothing else in the app updates a booking row.
DROP POLICY IF EXISTS "auth_update_bookings" ON bookings;

-- Payments: no direct client INSERT. Every payment is written by
-- record_payment(), which derives client_id/recorded_by/receipt_number
-- server-side and locks the booking row.
DROP POLICY IF EXISTS "auth_insert_payments" ON payments;

-- Bookings INSERT: createBooking() always inserts a brand-new, unpaid,
-- confirmed row owned by the caller. Replace the WITH CHECK (true) policy
-- with one that enforces exactly that, so this remaining direct-write path
-- can't be used to fabricate paid/checked-in/cancelled bookings or attribute
-- a booking to another user.
DROP POLICY IF EXISTS "auth_insert_bookings" ON bookings;
CREATE POLICY "auth_insert_bookings" ON bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND amount_paid = 0
    AND payment_status = 'unpaid'
    AND booking_status = 'confirmed'
  );

-- ============================================================
-- M3 — pin search_path on handle_new_user() (was never actually set)
-- ============================================================
ALTER FUNCTION handle_new_user() SET search_path = public;

-- ============================================================
-- M4 — cap the anon-writable metric payload
-- ============================================================
CREATE OR REPLACE FUNCTION log_client_metric(
  p_metric_type text,
  p_metric_name text,
  p_value       numeric,
  p_rating      text DEFAULT NULL,
  p_path        text DEFAULT NULL,
  p_metadata    jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reject oversized/garbage payloads before they hit the table. These are
  -- generous limits for genuine web-vital/query/error metrics; anything
  -- larger is abuse of the anon grant, not a real metric.
  IF length(p_metric_name) > 200
     OR length(COALESCE(p_path, '')) > 500
     OR length(COALESCE(p_metadata::text, '')) > 4000 THEN
    RAISE EXCEPTION 'Metric payload too large';
  END IF;

  -- auth.uid() is NULL for unauthenticated callers (e.g. the login page);
  -- that's fine, recorded_by is nullable.
  INSERT INTO performance_metrics (metric_type, metric_name, value, rating, path, metadata, recorded_by)
  VALUES (p_metric_type, p_metric_name, p_value, p_rating, p_path, p_metadata, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION log_client_metric(text, text, numeric, text, text, jsonb) TO authenticated, anon;
