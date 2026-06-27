import { supabase } from '@/shared/lib/supabase'

// The only module allowed to query the `locations` table directly.

export interface Location {
  id: string
  name: string
  city: string | null
  created_at?: string
}

export async function listLocations(): Promise<Location[]> {
  const { data, error } = await supabase.from('locations').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function createLocation({ name, city }: { name: string; city?: string | null }): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('locations')
    .insert({ name, city: city || null })
    .select('id')
    .single()
  if (error) throw error
  return data
}
