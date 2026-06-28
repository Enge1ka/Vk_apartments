-- VK Apartments — booking data-integrity constraints
-- Run this once in the Supabase SQL Editor after supabase-error-logging.sql.
--
-- The app's own validators (bookings/validators.ts) already reject
-- same-day/backward dates, and total_amount is always client-computed as
-- rate_per_day * number_of_days (NewBookingPage.tsx) — there's no UI path
-- that can produce a bad row. These constraints are a database-level
-- backstop against a future bug or a direct SQL/API write bypassing the UI.

ALTER TABLE bookings
  ADD CONSTRAINT check_out_after_check_in CHECK (check_out_date > check_in_date);

ALTER TABLE bookings
  ADD CONSTRAINT check_total_amount_matches_rate CHECK (total_amount = rate_per_day * number_of_days);
