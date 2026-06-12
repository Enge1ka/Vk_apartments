import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export function useAuth() {
  const { user, profile, authReady, setUser, setProfile, setAuthReady, clearUser } = useAppStore()

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data)
  }

  useEffect(() => {
    const timeout = setTimeout(() => setAuthReady(true), 8000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout)
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id)
      setAuthReady(true)
    }).catch(() => { clearTimeout(timeout); setAuthReady(true) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id)
      else clearUser()
      setAuthReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearUser()
  }

  const isAdmin = profile?.role === 'admin'
  const locationId = profile?.location_id ?? null
  // All non-admins are restricted; null locationId means no data access
  const isRestricted = !isAdmin

  return { user, profile, authReady, signIn, signOut, isAdmin, locationId, isRestricted }
}
