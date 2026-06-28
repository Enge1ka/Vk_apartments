-- VK Apartments — pin search_path on SECURITY DEFINER functions
-- Run this once in the Supabase SQL Editor after supabase-realtime.sql.
--
-- A SECURITY DEFINER function with no pinned search_path resolves
-- unqualified table/sequence names using the *caller's* search_path —
-- a caller able to create objects in a schema ahead of `public` in their
-- own search_path could shadow what the function actually reads/writes
-- (a search-path hijack). handle_new_user() already has this fixed
-- (supabase-schema.sql); these four did not.

ALTER FUNCTION next_booking_ref() SET search_path = public;

ALTER FUNCTION record_payment(uuid, numeric, date, text) SET search_path = public;

ALTER FUNCTION update_booking_status(uuid, text, text) SET search_path = public;

ALTER FUNCTION log_client_metric(text, text, numeric, text, text, jsonb) SET search_path = public;
