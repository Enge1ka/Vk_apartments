import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ logMetric: vi.fn() }))
vi.mock('./reportWebVitals', () => ({ reportWebVitals: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.resetModules()
})

// Re-import everything fresh (including shared/lib/metrics) so the
// pub/sub listeners init.js registers and the emitMetric this test calls
// are talking to the same module instance — vi.resetModules() otherwise
// gives init.js a different metrics module than one imported statically.
async function freshInit() {
  const { initMonitoring } = await import('./init')
  const { logMetric } = await import('./api')
  const { reportWebVitals } = await import('./reportWebVitals')
  const { emitMetric } = await import('@/shared/lib/metrics')
  return { initMonitoring, logMetric, reportWebVitals, emitMetric }
}

describe('initMonitoring', () => {
  it('starts web-vitals reporting and forwards only slow queries to logMetric', async () => {
    const { initMonitoring, logMetric, reportWebVitals, emitMetric } = await freshInit()
    initMonitoring()

    expect(reportWebVitals).toHaveBeenCalledTimes(1)

    emitMetric({ type: 'query', name: 'fastQuery', durationMs: 100, path: '/bookings', status: 'success' })
    expect(logMetric).not.toHaveBeenCalled()

    emitMetric({ type: 'query', name: 'slowQuery', durationMs: 2000, path: '/reports', status: 'success' })
    expect(logMetric).toHaveBeenCalledWith({
      metricType: 'query', metricName: 'slowQuery', value: 2000, path: '/reports', metadata: { status: 'success' },
    })
  })

  it('does not initialize twice', async () => {
    const { initMonitoring, reportWebVitals } = await freshInit()
    initMonitoring()
    initMonitoring()
    expect(reportWebVitals).toHaveBeenCalledTimes(1)
  })

  it('ignores web-vital metrics from the shared emitter (only query metrics are forwarded here)', async () => {
    const { initMonitoring, logMetric, emitMetric } = await freshInit()
    initMonitoring()

    emitMetric({ type: 'web-vital', name: 'LCP', durationMs: 5000 })
    expect(logMetric).not.toHaveBeenCalled()
  })
})
