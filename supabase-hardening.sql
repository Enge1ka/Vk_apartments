-- VK Apartments — RPC grant hardening
-- Run this once in the Supabase SQL Editor after supabase-monitoring.sql.
--
-- CREATE FUNCTION implicitly grants EXECUTE to PUBLIC unless explicitly
-- revoked — none of the earlier migrations did that, so next_booking_ref(),
-- record_payment(), and update_booking_status() have been callable by the
-- anon role this whole time, relying solely on their own internal
-- auth.uid()/profiles checks to reject unauthenticated callers. That
-- internal check is correct and sufficient (anon's auth.uid() is NULL,
-- so the profile lookup always fails and the function raises before doing
-- anything sensitive) — but defense-in-depth means the grant itself
-- should also reflect "staff only," not just the function body.
--
-- log_client_metric() is deliberately left granted to anon too — the
-- login page (pre-auth) needs to report Core Web Vitals.

REVOKE EXECUTE ON FUNCTION next_booking_ref() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_payment(uuid, numeric, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_booking_status(uuid, text, text) FROM PUBLIC;

-- Re-grant to authenticated explicitly (REVOKE FROM PUBLIC removes the
-- blanket grant entirely; these three were already granted to
-- authenticated in earlier migrations, but re-asserting here makes this
-- file correct and re-runnable on its own).
GRANT EXECUTE ON FUNCTION next_booking_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION record_payment(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_booking_status(uuid, text, text) TO authenticated;
