import { useEffect, useRef, useState } from 'react'
import { emitMetric } from '@/shared/lib/metrics'

// Replaces the repeated `useState(loading/error/data) + useEffect` pattern
// that was hand-rolled in every page (see useApartments/useBookings, which
// this mirrors). `queryFn` is an async function (usually a feature's api.ts
// call) re-run whenever `deps` change. `label` identifies this query in
// performance metrics (see shared/lib/metrics.ts) — pass a descriptive,
// stable name so a slow-query warning is actionable instead of anonymous.
export function useSupabaseQuery<T>(queryFn: () => Promise<T>, deps: unknown[] = [], label = 'unlabeled-query') {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Bumped on every fetchData call so a slower, older request can detect
  // it's been superseded and skip writing its (stale) result over a newer one.
  const requestId = useRef(0)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  async function fetchData() {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    const start = performance.now()
    let status: 'success' | 'error' = 'success'
    try {
      const result = await queryFn()
      if (id !== requestId.current) return
      setData(result)
      setError(null)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
      status = 'error'
    } finally {
      if (id === requestId.current) setLoading(false)
      emitMetric({
        type: 'query',
        name: label,
        durationMs: performance.now() - start,
        status,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      })
    }
  }

  return { data, loading, error, refetch: fetchData }
}
