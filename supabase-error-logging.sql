-- VK Apartments — client error reporting
-- Run this once in the Supabase SQL Editor after supabase-hardening.sql.
-- Widens performance_metrics.metric_type to also accept 'error', so the
-- React ErrorBoundary can report uncaught render errors through the
-- existing log_client_metric() RPC instead of only console.error.

ALTER TABLE performance_metrics DROP CONSTRAINT performance_metrics_metric_type_check;
ALTER TABLE performance_metrics ADD CONSTRAINT performance_metrics_metric_type_check
  CHECK (metric_type IN ('web-vital', 'query', 'error'));
