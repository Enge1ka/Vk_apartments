-- VK Apartments — remove anonymous/over-broad function access
-- Run this once in the Supabase SQL Editor after supabase-switch-room.sql.
-- Safe to re-run (idempotent).
--
-- Found in the 2026-11-15 security review:
--
--  1. Earlier migrations used `REVOKE EXECUTE ... FROM PUBLIC` to make RPCs
--     staff-only. On Supabase that is not enough: the platform's default
--     privileges grant EXECUTE on every new public function to `anon` and
--     `authenticated` *by name*, and revoking from PUBLIC leaves those
--     grants in place. An unauthenticated caller could therefore reach every
--     RPC. Most reject a caller with no profile, but these have no internal
--     check at all:
--       * purge_old_performance_metrics(days) — anon could wipe the table
--       * auto_checkout_due_bookings()        — anon could trigger checkouts
--       * next_booking_ref()                  — anon could burn references
--       * refresh_booking_rollup / sync_apartment_status
--
--  2. The "auth_insert_bookings" policy still allowed a direct INSERT into
--     bookings with an arbitrary total_amount. Nothing in the app uses it —
--     every booking is created by create_booking_with_apartments(), which is
--     SECURITY DEFINER and needs no table policy.

BEGIN;

-- ------------------------------------------------------------
-- Internal-only functions: called by cron, triggers, or from inside other
-- SECURITY DEFINER functions (which run as the owner). No client role
-- needs EXECUTE on any of them.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION auto_checkout_due_bookings()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION purge_old_performance_metrics(integer)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_booking_rollup(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_apartment_status(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION next_booking_ref()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_actor_name()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_new_user()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_bookings()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_booking_apartments()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_payments()                        FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Staff RPCs: signed-in users only. Each still enforces role/location
-- itself; this just stops unauthenticated callers reaching them at all.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION record_payment(uuid, numeric, date, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION record_refund(uuid, numeric, date, text, text)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_booking_with_apartments(uuid, jsonb, text)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_room_status(uuid, text, text)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_booking(uuid, text)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION extend_room(uuid, date, numeric)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION extend_room_new_rate(uuid, date, numeric)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION shorten_room(uuid, date)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION edit_room(uuid, date, date, numeric)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION switch_room(uuid, uuid, date, numeric)                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION record_payment(uuid, numeric, date, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION record_refund(uuid, numeric, date, text, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_with_apartments(uuid, jsonb, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION update_room_status(uuid, text, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(uuid, text)                            TO authenticated;
GRANT EXECUTE ON FUNCTION extend_room(uuid, date, numeric)                      TO authenticated;
GRANT EXECUTE ON FUNCTION extend_room_new_rate(uuid, date, numeric)             TO authenticated;
GRANT EXECUTE ON FUNCTION shorten_room(uuid, date)                              TO authenticated;
GRANT EXECUTE ON FUNCTION edit_room(uuid, date, date, numeric)                  TO authenticated;
GRANT EXECUTE ON FUNCTION switch_room(uuid, uuid, date, numeric)                TO authenticated;

-- log_client_metric() deliberately stays callable by anon: the login page
-- reports web vitals before anyone is signed in.

-- ------------------------------------------------------------
-- Stop future functions being auto-granted to anon. New RPCs must grant
-- EXECUTE explicitly.
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ------------------------------------------------------------
-- Bookings: no direct client INSERT.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_insert_bookings" ON bookings;

COMMIT;

-- To verify (expect no rows):
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname <> 'log_client_metric'
--     AND has_function_privilege('anon', p.oid, 'execute');
