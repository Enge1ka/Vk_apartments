-- VK Apartments — booking confirmation delivery log
-- Run this once in the Supabase SQL Editor after supabase-location-rls.sql.
-- Safe to re-run (idempotent).
--
-- One row per attempt to send a booking confirmation to the client, by
-- email or WhatsApp. Rows are written only by the
-- send-booking-confirmation Edge Function (service role, which bypasses
-- RLS), so there is deliberately no INSERT/UPDATE policy for clients:
-- staff can read the delivery history of bookings they can see, nothing
-- more.

BEGIN;

CREATE TABLE IF NOT EXISTS booking_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  channel             text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  -- sent    = accepted by the provider
  -- failed  = provider rejected it (see error)
  -- skipped = nothing to send to (no email/phone) or channel not configured
  status              text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  recipient           text,
  provider_message_id text,
  error               text,
  sent_by             uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_notifications_booking_idx
  ON booking_notifications (booking_id, created_at DESC);

ALTER TABLE booking_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_booking_notifications" ON booking_notifications;
CREATE POLICY "auth_read_booking_notifications" ON booking_notifications
  FOR SELECT TO authenticated
  USING ((SELECT is_admin()) OR booking_id IN (SELECT my_location_booking_ids()));

REVOKE ALL ON booking_notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON booking_notifications FROM authenticated;

COMMIT;
