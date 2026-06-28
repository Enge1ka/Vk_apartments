import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'

// The only module allowed to call supabase.auth.* / profiles directly.
// Pages and hooks call these functions instead of touching the client.

export type ProfileRole = 'admin' | 'employee'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: ProfileRole
  location_id: string | null
  created_at?: string
  // Only present on rows returned by listProfiles(), which joins locations.
  location?: { name: string } | null
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback)
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function sendPasswordResetEmail(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password })
}

// Admin user management (Settings page) — still the profiles table, so it
// stays here rather than spawning a separate "users" feature.
export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, location:locations(name)')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function setProfileRole(userId: string, role: ProfileRole): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}

export async function assignProfileLocation(userId: string, locationId: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ location_id: locationId || null }).eq('id', userId)
  if (error) throw error
}
