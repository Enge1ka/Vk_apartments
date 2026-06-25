-- VK Apartments — client performance monitoring
-- Run this once in the Supabase SQL Editor after supabase-refactor.sql.
-- See docs/database.md and docs/adr/0005-client-side-performance-monitoring.md.

CREATE TABLE performance_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type  text NOT NULL CHECK (metric_type IN ('web-vital', 'query')),
  metric_name  text NOT NULL,
  value        numeric NOT NULL,
  rating       text CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  path         text,
  metadata     jsonb,
  recorded_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX performance_metrics_type_name_idx ON performance_metrics (metric_type, metric_name);
CREATE INDEX performance_metrics_created_at_idx ON performance_metrics (created_at);

ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- Only admins can read collected metrics; no direct INSERT policy for
-- "authenticated" — every write goes through log_client_metric() below,
-- which derives recorded_by from auth.uid() server-side so a client can't
-- write a metric attributed to someone else.
CREATE POLICY "admin_read_performance_metrics" ON performance_metrics
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

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
AS $$
BEGIN
  -- auth.uid() is NULL for unauthenticated callers (e.g. the login page);
  -- that's fine, recorded_by is nullable.
  INSERT INTO performance_metrics (metric_type, metric_name, value, rating, path, metadata, recorded_by)
  VALUES (p_metric_type, p_metric_name, p_value, p_rating, p_path, p_metadata, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION log_client_metric(text, text, numeric, text, text, jsonb) TO authenticated, anon;
