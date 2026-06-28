-- VK Apartments — enable realtime on apartments/bookings
-- Run this once in the Supabase SQL Editor after supabase-data-integrity.sql.
--
-- subscribeToApartmentChanges() and subscribeToBookingChanges() (used by
-- ApartmentsPage, CalendarPage, and the Dashboard) subscribe to
-- postgres_changes on these tables — but Supabase only delivers those
-- events for tables explicitly added to the supabase_realtime publication.
-- Without this, the subscriptions silently never fire: no error, the
-- pages just never see another staff member's change until manual refresh.
-- Wrapped in existence checks so this is safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'apartments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE apartments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bookings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
END $$;
