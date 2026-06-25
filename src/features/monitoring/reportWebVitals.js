import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import { logMetric } from './api'

// Wires the web-vitals library's callbacks to logMetric. Call once, at app
// startup. Each callback fires once per metric per page load (web-vitals
// handles the "only when finalized" timing itself).
export function reportWebVitals() {
  function report(metric) {
    logMetric({
      metricType: 'web-vital',
      metricName: metric.name,
      value: metric.value,
      rating: metric.rating,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      metadata: { navigationType: metric.navigationType },
    })
  }

  onCLS(report)
  onFCP(report)
  onINP(report)
  onLCP(report)
  onTTFB(report)
}
