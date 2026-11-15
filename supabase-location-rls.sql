-- VK Apartments — enforce who-can-read-what in the database
-- Run this once in the Supabase SQL Editor after supabase-anon-lockdown.sql.
-- Safe to re-run (idempotent).
--
-- Found in the 2026-11-15 security review: every SELECT policy was
-- `USING (true)` for any signed-in user. Location gating of reads existed
-- only in the browser, so:
--   * an employee at one location could read another location's bookings
--     and payments by calling the API directly, and
--   * any account with no role/location (e.g. a self-registered one, if
--     public signups are ever left on) could read every client, booking,
--     payment and staff profile.
--
-- New rules:
--   bookings / booking_apartments / payments
--       admin: everything. Employee: only bookings that have at least one
--       room at their location (and all rooms/payments of those bookings).
--   clients
--       admin, or any staff member with an assigned location. Deliberately
--       NOT per-location: staff look up returning guests by phone when
--       taking a booking, and hiding other locations' guests would create
--       duplicate client records. Accounts with no location see nothing.
--   apartments / locations
--       admin, or any staff member with an assigned location.
--   profiles
--       admin: everyone. Everyone else: only their own row.
--
-- The helper functions are SECURITY DEFINER so a policy can consult
-- profiles / booking_apartments without tripping over those tables' own
-- policies (and without policy recursion). Policies wrap them in
-- `(SELECT ...)` / `IN (SELECT ...)` so Postgres evaluates each once per
-- query instead of once per row.

BEGIN;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION my_location()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT location_id FROM profiles WHERE id = auth.uid();
$$;

-- Admin, or an employee who has been assigned a location.
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' OR location_id IS NOT NULL FROM profiles WHERE id = auth.uid()),
    false);
$$;

-- IDs of every booking with at least one room at the caller's location.
CREATE OR REPLACE FUNCTION my_location_booking_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ba.booking_id
  FROM booking_apartments ba
  JOIN apartments a ON a.id = ba.apartment_id
  WHERE a.location_id = (SELECT location_id FROM profiles WHERE id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION is_admin()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION my_location()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_staff()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION my_location_booking_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION is_admin()                TO authenticated;
GRANT  EXECUTE ON FUNCTION my_location()             TO authenticated;
GRANT  EXECUTE ON FUNCTION is_staff()                TO authenticated;
GRANT  EXECUTE ON FUNCTION my_location_booking_ids() TO authenticated;

-- ---------------- bookings ----------------
DROP POLICY IF EXISTS "auth_read_bookings" ON bookings;
CREATE POLICY "auth_read_bookings" ON bookings FOR SELECT TO authenticated
  USING ((SELECT is_admin()) OR id IN (SELECT my_location_booking_ids()));

-- ---------------- booking_apartments ----------------
DROP POLICY IF EXISTS "auth_read_booking_apartments" ON booking_apartments;
CREATE POLICY "auth_read_booking_apartments" ON booking_apartments FOR SELECT TO authenticated
  USING ((SELECT is_admin()) OR booking_id IN (SELECT my_location_booking_ids()));

-- ---------------- payments ----------------
DROP POLICY IF EXISTS "auth_read_payments" ON payments;
CREATE POLICY "auth_read_payments" ON payments FOR SELECT TO authenticated
  USING ((SELECT is_admin()) OR booking_id IN (SELECT my_location_booking_ids()));

-- ---------------- clients ----------------
DROP POLICY IF EXISTS "auth_read_clients" ON clients;
CREATE POLICY "auth_read_clients" ON clients FOR SELECT TO authenticated
  USING ((SELECT is_staff()));

DROP POLICY IF EXISTS "auth_insert_clients" ON clients;
CREATE POLICY "auth_insert_clients" ON clients FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_staff()));

DROP POLICY IF EXISTS "auth_update_clients" ON clients;
CREATE POLICY "auth_update_clients" ON clients FOR UPDATE TO authenticated
  USING ((SELECT is_staff())) WITH CHECK ((SELECT is_staff()));

-- ---------------- apartments / locations ----------------
DROP POLICY IF EXISTS "auth_read_apartments" ON apartments;
CREATE POLICY "auth_read_apartments" ON apartments FOR SELECT TO authenticated
  USING ((SELECT is_staff()));

DROP POLICY IF EXISTS "auth_read_locations" ON locations;
CREATE POLICY "auth_read_locations" ON locations FOR SELECT TO authenticated
  USING ((SELECT is_staff()));

-- ---------------- profiles ----------------
DROP POLICY IF EXISTS "auth_read_profiles" ON profiles;
CREATE POLICY "auth_read_profiles" ON profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT is_admin()));

COMMIT;
