-- VK Apartments — monthly cleanup of old performance_metrics rows
-- Run once in the Supabase SQL Editor after supabase-monitoring.sql.
-- Idempotent (CREATE OR REPLACE + guarded schedule). Requires pg_cron
-- (already enabled by supabase-auto-checkout.sql).
--
-- performance_metrics collects a row per web-vital, slow query, and uncaught
-- error, forever. It's operational telemetry, not business data — nobody needs
-- last year's page-load timings — so left unbounded it just grows and slows the
-- admin "Performance" tab. This purges anything older than 90 days, monthly.

CREATE OR REPLACE FUNCTION purge_old_performance_metrics(p_keep_days integer DEFAULT 90)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM performance_metrics
    WHERE created_at < now() - make_interval(days => p_keep_days)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_old_performance_metrics(integer) FROM PUBLIC;

-- Schedule for 03:00 UTC on the 1st of each month. Drop any prior copy first
-- so re-running this file doesn't stack duplicate jobs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vk-purge-metrics-monthly') THEN
    PERFORM cron.unschedule('vk-purge-metrics-monthly');
  END IF;
END $$;

SELECT cron.schedule(
  'vk-purge-metrics-monthly',
  '0 3 1 * *',                       -- 03:00 UTC, 1st of every month
  $$SELECT purge_old_performance_metrics();$$
);

-- Verify later:  SELECT jobname, schedule FROM cron.job WHERE jobname = 'vk-purge-metrics-monthly';
-- Run once now:  SELECT purge_old_performance_metrics();
