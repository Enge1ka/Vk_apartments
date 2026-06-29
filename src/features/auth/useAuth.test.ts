import type { Session, User } from '@supabase/supabase-js'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { useAuth, useAuthInit } from './useAuth'
import { useAuthStore } from './store'
import * as api from './api'
import type { Profile } from './api'

afterEach(() => {
  useAuthStore.setState({ user: null, profile: null, authReady: false })
  vi.restoreAllMocks()
})

function mockAuthStateChange() {
  const unsubscribe = vi.fn()
  vi.spyOn(api, 'onAuthStateChange').mockReturnValue({
    data: { subscription: { unsubscribe } },
  } as unknown as ReturnType<typeof api.onAuthStateChange>)
  return unsubscribe
}

// Captures the callback passed to onAuthStateChange so a test can invoke
// it directly, simulating a real SIGNED_IN/SIGNED_OUT event from Supabase.
function captureAuthStateChange() {
  let callback: (event: string, session: Session | null) => void = () => {}
  vi.spyOn(api, 'onAuthStateChange').mockImplementation((cb) => {
    callback = cb as typeof callback
    return { data: { subscription: { unsubscribe: vi.fn() } } } as unknown as ReturnType<typeof api.onAuthStateChange>
  })
  return (event: string, session: Session | null) => callback(event, session)
}

// useAuthInit() owns the session/listener effect (mounted once at the app
// root in real usage); useAuth() just reads the resulting state. Tests
// combine both so the effect actually runs.
function renderAuth() {
  return renderHook(() => {
    useAuthInit()
    return useAuth()
  })
}

describe('useAuth', () => {
  it('marks auth ready once the session resolves, with no session', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue(null)
    mockAuthStateChange()

    const { result } = renderAuth()
    await waitFor(() => expect(result.current.authReady).toBe(true))

    expect(result.current.user).toBeNull()
    expect(result.current.isRestricted).toBe(true)
  })

  it('loads the profile and derives isAdmin/locationId when a session exists', async () => {
    const user = { id: 'user-1' } as User
    vi.spyOn(api, 'getSession').mockResolvedValue({ user } as Session)
    vi.spyOn(api, 'getProfile').mockResolvedValue({ role: 'admin', location_id: 'loc-1' } as Profile)
    mockAuthStateChange()

    const { result } = renderAuth()
    await waitFor(() => expect(result.current.authReady).toBe(true))

    expect(result.current.user).toEqual(user)
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isRestricted).toBe(false)
    expect(result.current.locationId).toBe('loc-1')
  })

  it('retries a failed profile fetch instead of stranding an admin as restricted', async () => {
    vi.useFakeTimers()
    const user = { id: 'user-1' } as User
    vi.spyOn(api, 'getSession').mockResolvedValue({ user } as Session)
    vi.spyOn(api, 'getProfile')
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ role: 'admin', location_id: 'loc-1' } as Profile)
    mockAuthStateChange()
    const toastErrorSpy = vi.spyOn(toast, 'error')

    const { result } = renderAuth()
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isRestricted).toBe(false)
    expect(toastErrorSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('gives up and warns after exhausting profile fetch retries', async () => {
    vi.useFakeTimers()
    const user = { id: 'user-1' } as User
    vi.spyOn(api, 'getSession').mockResolvedValue({ user } as Session)
    vi.spyOn(api, 'getProfile').mockRejectedValue(new Error('still down'))
    mockAuthStateChange()
    const toastErrorSpy = vi.spyOn(toast, 'error')

    const { result } = renderAuth()
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })

    expect(result.current.profile).toBeNull()
    expect(result.current.isRestricted).toBe(true)
    expect(toastErrorSpy).toHaveBeenCalledWith('Could not load your profile. Please refresh the page.')
    vi.useRealTimers()
  })

  it('loads the profile after a real SIGNED_IN event without deadlocking', async () => {
    // Regression test for a real Supabase client deadlock: the auth client
    // holds an internal lock for the duration of the onAuthStateChange
    // callback, and any Supabase call made *from inside* it (getProfile's
    // database query needs the same lock to attach the auth token) hangs
    // forever waiting on a lock that can't release until the callback
    // returns — which it never does, because it's awaiting that exact
    // call. The fix defers the call with setTimeout so it runs after the
    // callback has already returned.
    vi.spyOn(api, 'getSession').mockResolvedValue(null)
    const fireAuthStateChange = captureAuthStateChange()
    vi.spyOn(api, 'getProfile').mockResolvedValue({ role: 'admin', location_id: 'loc-1' } as Profile)

    const { result } = renderAuth()
    await waitFor(() => expect(result.current.authReady).toBe(true))

    const user = { id: 'user-1' } as User
    act(() => { fireAuthStateChange('SIGNED_IN', { user } as Session) })

    await waitFor(() => expect(result.current.user).toEqual(user))
    await waitFor(() => expect(result.current.isAdmin).toBe(true))
    expect(result.current.locationId).toBe('loc-1')
  })

  it('still marks auth ready if getSession hangs past the timeout fallback', async () => {
    vi.useFakeTimers()
    vi.spyOn(api, 'getSession').mockReturnValue(new Promise(() => {})) // never resolves
    mockAuthStateChange()

    const { result } = renderAuth()
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

    const { result } = renderAuth()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })

    useAuthStore.setState({ user: { id: 'user-1' } as User })

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
