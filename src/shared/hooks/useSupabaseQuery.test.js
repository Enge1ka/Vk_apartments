import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSupabaseQuery } from './useSupabaseQuery'

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
})
