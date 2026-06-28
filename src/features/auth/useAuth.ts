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

export function useAuth() {
  const { user, profile, authReady, setUser, setProfile, setAuthReady, clearUser } = useAuthStore()

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

    const { data: { subscription } } = onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id)
      else clearUser()
      setAuthReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

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
  // All non-admins are restricted; null locationId means no data access
  const isRestricted = !isAdmin

  return { user, profile, authReady, signIn, signOut, isAdmin, locationId, isRestricted }
}
