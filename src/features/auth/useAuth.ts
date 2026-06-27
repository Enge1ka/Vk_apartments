import { useEffect } from 'react'
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
    const data = await getProfile(userId)
    if (data) setProfile(data)
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
