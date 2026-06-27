import { supabase } from '@/shared/lib/supabase'

export type MetricType = 'web-vital' | 'query'
export type MetricRating = 'good' | 'needs-improvement' | 'poor'

export interface PerformanceMetric {
  id: string
  metric_type: MetricType
  metric_name: string
  value: number
  rating: MetricRating | null
  path: string | null
  metadata: Record<string, unknown> | null
  recorded_by: string | null
  created_at: string
}

export interface LogMetricInput {
  metricType: MetricType
  metricName: string
  value: number
  rating?: MetricRating | null
  path?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ListMetricsFilters {
  metricType?: MetricType
  since?: string
  limit?: number
}

// The only module allowed to query the `performance_metrics` table or
// call log_client_metric. Never throws on failure — a broken metrics
// pipe must not break the page it's instrumenting, so callers only see
// a console warning.
export async function logMetric({ metricType, metricName, value, rating, path, metadata }: LogMetricInput): Promise<void> {
  const { error } = await supabase.rpc('log_client_metric', {
    p_metric_type: metricType,
    p_metric_name: metricName,
    p_value: value,
    p_rating: rating ?? null,
    p_path: path ?? null,
    p_metadata: metadata ?? null,
  })
  if (error) console.warn('[monitoring] failed to log metric:', error.message)
}

export async function listMetrics({ metricType, since, limit = 100 }: ListMetricsFilters = {}): Promise<PerformanceMetric[]> {
  let query = supabase.from('performance_metrics').select('*').order('created_at', { ascending: false }).limit(limit)
  if (metricType) query = query.eq('metric_type', metricType)
  if (since) query = query.gte('created_at', since)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as PerformanceMetric[]
}
