// Generic, feature-agnostic instrumentation point. shared/ must not import
// from features/, so this is a plain pub/sub: useSupabaseQuery (and
// anything else generic) emits events here; features/monitoring is the
// only subscriber, forwarding events to the performance_metrics table.
// Without a subscriber, slow-query warnings still show up in the console.

export const SLOW_QUERY_THRESHOLD_MS = 1000

const listeners = new Set()

export function onMetric(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function emitMetric(event) {
  if (event.type === 'query' && event.durationMs > SLOW_QUERY_THRESHOLD_MS) {
    console.warn(`[slow query] ${event.name} took ${Math.round(event.durationMs)}ms`)
  }
  for (const listener of listeners) listener(event)
}
