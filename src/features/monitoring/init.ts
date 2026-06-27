import { onMetric, SLOW_QUERY_THRESHOLD_MS } from '@/shared/lib/metrics'
import { logMetric } from './api'
import { reportWebVitals } from './reportWebVitals'

let initialized = false

// Call once at app startup (see app/App.jsx). Guarded against double-init
// since StrictMode double-invokes effects in development.
export function initMonitoring() {
  if (initialized) return
  initialized = true

  // Only persist queries that actually crossed the slow threshold — every
  // query firing on every page load would make performance_metrics noise,
  // not signal. shared/lib/metrics.js already console.warns on all of them.
  onMetric((event) => {
    if (event.type !== 'query' || event.durationMs <= SLOW_QUERY_THRESHOLD_MS) return
    logMetric({
      metricType: 'query',
      metricName: event.name,
      value: event.durationMs,
      path: event.path,
      metadata: { status: event.status },
    })
  })

  reportWebVitals()
}
