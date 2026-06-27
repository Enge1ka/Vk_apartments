import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitMetric, onMetric, SLOW_QUERY_THRESHOLD_MS, type MetricEvent } from './metrics'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('onMetric / emitMetric', () => {
  it('delivers emitted events to subscribers', () => {
    const received: MetricEvent[] = []
    const unsubscribe = onMetric((event) => received.push(event))

    emitMetric({ type: 'query', name: 'listBookings', durationMs: 50 })

    expect(received).toEqual([{ type: 'query', name: 'listBookings', durationMs: 50 }])
    unsubscribe()
  })

  it('stops delivering events after unsubscribe', () => {
    const received: MetricEvent[] = []
    const unsubscribe = onMetric((event) => received.push(event))
    unsubscribe()

    emitMetric({ type: 'query', name: 'listBookings', durationMs: 50 })

    expect(received).toEqual([])
  })

  it('warns on a slow query but not a fast one', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    emitMetric({ type: 'query', name: 'fastQuery', durationMs: SLOW_QUERY_THRESHOLD_MS - 1 })
    expect(warnSpy).not.toHaveBeenCalled()

    emitMetric({ type: 'query', name: 'slowQuery', durationMs: SLOW_QUERY_THRESHOLD_MS + 1 })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('slowQuery'))
  })

  it('does not warn for non-query metrics regardless of value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    emitMetric({ type: 'web-vital', name: 'LCP', durationMs: 99999 })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
