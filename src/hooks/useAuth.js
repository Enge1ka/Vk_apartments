import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export function useAuth() {
  const { user, profile, authReady, setUser, setProfile, setAuthReady, clearUser } = useAppStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
    }).finally(() => setAuthReady(true))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else clearUser()
      setAuthReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearUser()
  }

  const locationId = profile?.location_id || null
  const isRestricted = profile?.role !== 'admin' && !!locationId

  return { user, profile, authReady, signIn, signOut, isAdmin: profile?.role === 'admin', locationId, isRestricted }
}
