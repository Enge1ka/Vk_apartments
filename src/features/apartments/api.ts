import { supabase } from '@/shared/lib/supabase'
import type { ApartmentStatus } from '@/shared/constants/status'

// The only module allowed to query the `apartments` table directly.

export interface Apartment {
  id: string
  location_id: string
  apartment_number: string
  type: string
  daily_rate: number
  weekly_rate: number | null
  monthly_rate: number | null
  status: ApartmentStatus
  notes: string | null
  location?: { id: string; name: string; city: string | null } | null
}

export interface ApartmentFilters {
  locationId?: string
  status?: string
  type?: string
}

export interface ApartmentInput {
  location_id: string
  apartment_number: string
  type: string
  daily_rate: number
  weekly_rate?: number | null
  monthly_rate?: number | null
  status: ApartmentStatus
  notes?: string | null
}

export async function listApartments(filters: ApartmentFilters = {}): Promise<Apartment[]> {
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

export async function createApartment(payload: ApartmentInput): Promise<void> {
  const { error } = await supabase.from('apartments').insert(payload)
  if (error) throw error
}

export async function updateApartment(id: string, payload: ApartmentInput): Promise<void> {
  const { error } = await supabase.from('apartments').update(payload).eq('id', id)
  if (error) throw error
}

// Resolves the apartment IDs for a location, used by every other feature
// (bookings, payments, dashboard, reports, calendar) to scope queries on
// tables that don't have a location_id of their own.
export async function listApartmentIds(locationId: string): Promise<string[]> {
  const { data, error } = await supabase.from('apartments').select('id').eq('location_id', locationId)
  if (error) throw error
  return (data ?? []).map(a => a.id)
}

// Subscribes to realtime apartment changes; returns an unsubscribe function.
export function subscribeToApartmentChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel('apartments-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apartments' }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
