import { supabase } from '@/shared/lib/supabase'

// The only module allowed to query the `locations` table directly.

export async function listLocations() {
  const { data, error } = await supabase.from('locations').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function createLocation({ name, city }) {
  const { data, error } = await supabase
    .from('locations')
    .insert({ name, city: city || null })
    .select('id')
    .single()
  if (error) throw error
  return data
}
