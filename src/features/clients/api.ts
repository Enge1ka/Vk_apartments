import { supabase } from '@/shared/lib/supabase'
import type { BookingStatus } from '@/shared/constants/status'

// The only module allowed to query the `clients` table directly.

export interface Client {
  id: string
  full_name: string
  phone: string
  nrc_or_passport: string | null
  email: string | null
  company: string | null
  created_at?: string
  // Only present on rows returned by listClients(), which joins bookings.
  bookings?: {
    id: string
    booking_reference: string
    total_amount: number
    booking_status: BookingStatus
    check_in_date: string
  }[]
}

export interface ClientInput {
  full_name: string
  phone: string
  nrc_or_passport?: string | null
  email?: string | null
  company?: string | null
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*, bookings(id, booking_reference, total_amount, booking_status, check_in_date)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Looks up a client by phone number, creating one if none exists.
// Used by the booking flow, which never shows a separate "create client" step.
export async function findOrCreateClient({ full_name, phone, nrc_or_passport, email, company }: ClientInput): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('clients').select('id').eq('phone', phone).maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id

  const { data, error } = await supabase.from('clients').insert({
    full_name,
    phone,
    nrc_or_passport: nrc_or_passport || null,
    email: email || null,
    company: company || null,
  }).select('id').single()
  if (error) throw error
  return data.id
}
