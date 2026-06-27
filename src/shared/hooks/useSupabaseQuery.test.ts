import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSupabaseQuery } from './useSupabaseQuery'
import { onMetric, type MetricEvent } from '@/shared/lib/metrics'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSupabaseQuery', () => {
  it('starts loading and resolves with data on success', async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: 1 }])
    const { result } = renderHook(() => useSupabaseQuery(queryFn, []))

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual([{ id: 1 }])
    expect(result.current.error).toBeNull()
  })

  it('captures a thrown error instead of crashing', async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSupabaseQuery(queryFn, []))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toBeNull()
  })

  it('refetch() re-runs the query', async () => {
    const queryFn = vi.fn().mockResolvedValue('ok')
    const { result } = renderHook(() => useSupabaseQuery(queryFn, []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(queryFn).toHaveBeenCalledTimes(1)
    await result.current.refetch()
    expect(queryFn).toHaveBeenCalledTimes(2)
  })

  it('emits a query metric with the given label and a success status', async () => {
    const events: MetricEvent[] = []
    const unsubscribe = onMetric((e) => events.push(e))

    const queryFn = vi.fn().mockResolvedValue('ok')
    const { result } = renderHook(() => useSupabaseQuery(queryFn, [], 'listBookings'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    unsubscribe()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'query', name: 'listBookings', status: 'success' })
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('emits an error status when the query rejects', async () => {
    const events: MetricEvent[] = []
    const unsubscribe = onMetric((e) => events.push(e))

    const queryFn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSupabaseQuery(queryFn, [], 'listBookings'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    unsubscribe()
    expect(events[0]).toMatchObject({ type: 'query', name: 'listBookings', status: 'error' })
  })

  it('defaults to an "unlabeled-query" label when none is given', async () => {
    const events: MetricEvent[] = []
    const unsubscribe = onMetric((e) => events.push(e))

    const queryFn = vi.fn().mockResolvedValue('ok')
    const { result } = renderHook(() => useSupabaseQuery(queryFn, []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    unsubscribe()
    expect(events[0].name).toBe('unlabeled-query')
  })
})
