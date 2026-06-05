-- Run this once in Supabase SQL Editor if the original prototype schema was already applied.
-- It aligns Row Level Security with the publish-ready app, where authenticated staff
-- can set up locations and apartments from the Apartments screen.

DROP POLICY IF EXISTS "admin_manage_apartments" ON apartments;
DROP POLICY IF EXISTS "admin_manage_locations" ON locations;
DROP POLICY IF EXISTS "auth_manage_apartments" ON apartments;
DROP POLICY IF EXISTS "auth_manage_locations" ON locations;

-- Apartments: admins have full access; staff can only manage their assigned location's apartments
CREATE POLICY "auth_manage_apartments" ON apartments
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  );

-- Locations: admin-only create/update/delete
CREATE POLICY "auth_manage_locations" ON locations
  FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
