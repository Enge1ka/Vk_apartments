import { supabase } from '@/shared/lib/supabase'

// The only module allowed to query the `apartments` table directly.

export async function listApartments(filters = {}) {
  let query = supabase
    .from('apartments')
    .select('*, location:locations(id, name, city)')
    .order('apartment_number')

  if (filters.locationId) query = query.eq('location_id', filters.locationId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.type) query = query.eq('type', filters.type)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createApartment(payload) {
  const { error } = await supabase.from('apartments').insert(payload)
  if (error) throw error
}

export async function updateApartment(id, payload) {
  const { error } = await supabase.from('apartments').update(payload).eq('id', id)
  if (error) throw error
}

// Subscribes to realtime apartment changes; returns an unsubscribe function.
export function subscribeToApartmentChanges(onChange) {
  const channel = supabase
    .channel('apartments-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apartments' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
