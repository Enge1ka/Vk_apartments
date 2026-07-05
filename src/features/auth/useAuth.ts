import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from './store'
import {
  getProfile,
  getSession,
  onAuthStateChange,
  signInWithPassword,
  signOut as signOutApi,
} from './api'

// Bootstraps the session + profile and subscribes to auth changes. Must be
// mounted exactly once, at the app root (see AuthInit in src/app/App.tsx) —
// every other component should use useAuth() below instead, which only
// reads the resulting shared state. Previously every page called useAuth()
// directly, which embedded this same effect, so every navigation tore down
// one getSession()/8-second-timeout/onAuthStateChange subscription and
// spun up a new, independently-timed one on top of whatever the app root's
// own copy was doing. Concurrent listeners with no coordination between
// them is exactly the kind of thing that produces "sometimes wrong" auth
// state tied to navigation timing — most visibly, a logout immediately
// followed by a login could leave an admin's profile cleared by a stale
// listener from the page they were on before.
export function useAuthInit() {
  const { setUser, setProfile, setAuthReady, clearUser } = useAuthStore()

  async function fetchProfile(userId: string) {
    // A null profile fails the user closed to "restricted, no location" (see
    // isAdmin/isRestricted below), so a single transient blip right after
    // login — a cold-starting Supabase project, a dropped request — would
    // otherwise strand an admin as a powerless employee for the whole
    // session. Retry a couple of times before actually giving up.
    const delaysMs = [500, 1500]
    for (let attempt = 0; ; attempt++) {
      try {
        const data = await getProfile(userId)
        if (data) setProfile(data)
        return
      } catch (err) {
        if (attempt >= delaysMs.length) {
          toast.error('Could not load your profile. Please refresh the page.')
          console.error('[auth] failed to load profile after retries:', err)
          return
        }
        await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]))
      }
    }
  }

  useEffect(() => {
    // If Supabase never responds, don't leave the UI stuck on a spinner forever.
    const timeout = setTimeout(() => setAuthReady(true), 8000)

    getSession().then(async (session) => {
      clearTimeout(timeout)
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id)
      setAuthReady(true)
    }).catch(() => { clearTimeout(timeout); setAuthReady(true) })

    // Supabase's auth client holds an internal lock for the entire duration
    // of this callback. Any other Supabase call made from inside it —
    // including getProfile()'s database query, which needs that same lock
    // internally to attach the current auth token — deadlocks waiting on a
    // lock that can't release until this callback returns. The callback
    // never returns because it's waiting on that exact call. Deferring with
    // setTimeout runs the actual work after this callback has returned and
    // the lock is free; this is Supabase's own documented workaround.
    const { data: { subscription } } = onAuthStateChange((_event, session) => {
      setTimeout(() => {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id).then(() => setAuthReady(true))
        } else {
          clearUser()
          setAuthReady(true)
        }
      }, 0)
    })

    return () => subscription.unsubscribe()
    // Mount-once by design (see the block comment above): this must set up
    // exactly one session bootstrap + auth listener for the app's lifetime.
    // The referenced setters are stable zustand actions and fetchProfile is
    // only ever called from inside here, so an empty dep array is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useAuth() {
  const { user, profile, authReady, clearUser } = useAuthStore()

  async function signIn(email: string, password: string) {
    const { data, error } = await signInWithPassword(email, password)
    return { data, error }
  }

  async function signOut() {
    try {
      // Don't let a hanging Supabase request block the user from being signed out locally.
      await Promise.race([
        signOutApi(),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ])
    } finally {
      clearUser()
    }
  }

  const isAdmin = profile?.role === 'admin'
  const locationId = profile?.location_id ?? null
  // A non-admin is location-restricted. NOTE: the data hooks scope by
  // `isRestricted && locationId`, so a restricted user with NO assigned
  // location currently falls through to seeing every location's data on
  // read — while the server-side RPCs (record_payment/update_booking_status)
  // reject them because NULL IS DISTINCT FROM any booking location. Until an
  // admin assigns them a location in Settings they can browse everything but
  // no write action will succeed. Assign a location on user creation to keep
  // read and write access consistent. See audit finding H3.
  const isRestricted = !isAdmin

  return { user, profile, authReady, signIn, signOut, isAdmin, locationId, isRestricted }
}
