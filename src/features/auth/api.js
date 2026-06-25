import { supabase } from '@/shared/lib/supabase'

// The only module allowed to call supabase.auth.* / profiles directly.
// Pages and hooks call these functions instead of touching the client.

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

export async function getProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export async function signInWithPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function sendPasswordResetEmail(email, redirectTo) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(password) {
  return supabase.auth.updateUser({ password })
}
