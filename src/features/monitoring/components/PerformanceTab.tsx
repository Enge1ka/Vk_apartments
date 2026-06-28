import { Card, CardContent } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listMetrics, type MetricRating, type PerformanceMetric } from '../api'
import type { BadgeVariant } from '@/shared/constants/status'
import { Gauge, Zap, AlertTriangle } from 'lucide-react'

const RATING_VARIANT: Record<MetricRating, BadgeVariant> = { good: 'success', 'needs-improvement': 'warning', poor: 'danger' }

function latestPerName(metrics: PerformanceMetric[]): PerformanceMetric[] {
  const seen = new Map<string, PerformanceMetric>()
  for (const m of metrics) {
    if (!seen.has(m.metric_name)) seen.set(m.metric_name, m)
  }
  return [...seen.values()]
}

export default function PerformanceTab() {
  const { data: metrics, loading, error } = useSupabaseQuery(() => listMetrics({ limit: 100 }), [], 'monitoring.listMetrics')

  const webVitals = latestPerName((metrics ?? []).filter(m => m.metric_type === 'web-vital'))
  const slowQueries = (metrics ?? []).filter(m => m.metric_type === 'query').slice(0, 10)
  const recentErrors = (metrics ?? []).filter(m => m.metric_type === 'error').slice(0, 10)

  if (error) return <ErrorBanner error={error} />
  if (loading) return <div className="text-center text-sm text-gray-400 py-8">Loading…</div>

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-800 text-sm">Recent errors</h2>
          </div>
          {recentErrors.length === 0 ? (
            <p className="text-sm text-gray-400">No errors recorded — good sign.</p>
          ) : (
            <div className="space-y-2">
              {recentErrors.map(e => (
                <div key={e.id} className="text-sm border-b border-gray-50 last:border-0 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-red-600">{e.metric_name}</span>
                    <span className="text-gray-400 text-xs">{e.path}</span>
                  </div>
                  {typeof e.metadata?.message === 'string' && (
                    <p className="text-gray-500 text-xs mt-0.5">{e.metadata.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gauge size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-800 text-sm">Core Web Vitals (most recent)</h2>
          </div>
          {webVitals.length === 0 ? (
            <p className="text-sm text-gray-400">No web-vitals recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {webVitals.map(v => (
                <div key={v.metric_name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{v.metric_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{v.value.toFixed(v.metric_name === 'CLS' ? 3 : 0)}</span>
                    {v.rating && <Badge variant={RATING_VARIANT[v.rating] || 'default'}>{v.rating}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-800 text-sm">Recent slow queries (&gt;1s)</h2>
          </div>
          {slowQueries.length === 0 ? (
            <p className="text-sm text-gray-400">None recorded — good sign.</p>
          ) : (
            <div className="space-y-2">
              {slowQueries.map(q => (
                <div key={q.id} className="flex items-center justify-between text-sm border-b border-gray-50 last:border-0 py-1.5">
                  <div>
                    <p className="text-gray-700 font-mono text-xs">{q.metric_name}</p>
                    <p className="text-gray-400 text-xs">{q.path}</p>
                  </div>
                  <span className="font-semibold text-red-600">{Math.round(q.value)}ms</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
