import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'
import { useAuthStore } from './store'
import * as api from './api'

afterEach(() => {
  useAuthStore.setState({ user: null, profile: null, authReady: false })
  vi.restoreAllMocks()
})

function mockAuthStateChange() {
  const unsubscribe = vi.fn()
  vi.spyOn(api, 'onAuthStateChange').mockReturnValue({ data: { subscription: { unsubscribe } } })
  return unsubscribe
}

describe('useAuth', () => {
  it('marks auth ready once the session resolves, with no session', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue(null)
    mockAuthStateChange()

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.authReady).toBe(true))

    expect(result.current.user).toBeNull()
    expect(result.current.isRestricted).toBe(true)
  })

  it('loads the profile and derives isAdmin/locationId when a session exists', async () => {
    const user = { id: 'user-1' }
    vi.spyOn(api, 'getSession').mockResolvedValue({ user })
    vi.spyOn(api, 'getProfile').mockResolvedValue({ role: 'admin', location_id: 'loc-1' })
    mockAuthStateChange()

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.authReady).toBe(true))

    expect(result.current.user).toEqual(user)
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isRestricted).toBe(false)
    expect(result.current.locationId).toBe('loc-1')
  })

  it('still marks auth ready if getSession hangs past the timeout fallback', async () => {
    vi.useFakeTimers()
    vi.spyOn(api, 'getSession').mockReturnValue(new Promise(() => {})) // never resolves
    mockAuthStateChange()

    const { result } = renderHook(() => useAuth())
    expect(result.current.authReady).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })

    expect(result.current.authReady).toBe(true)
    vi.useRealTimers()
  })

  it('signOut clears the local user even if the Supabase call hangs', async () => {
    vi.useFakeTimers()
    vi.spyOn(api, 'getSession').mockResolvedValue(null)
    mockAuthStateChange()
    vi.spyOn(api, 'signOut').mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useAuth())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })

    useAuthStore.setState({ user: { id: 'user-1' } })

    const signOutPromise = act(async () => {
      const p = result.current.signOut()
      await vi.advanceTimersByTimeAsync(5000)
      await p
    })
    await signOutPromise

    expect(useAuthStore.getState().user).toBeNull()
    vi.useRealTimers()
  })
})
