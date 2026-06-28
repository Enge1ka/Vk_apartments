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

// Matches "0977123456", "+260977123456", and "260 97 712 3456" as the same
// number — staff and clients type phone numbers inconsistently, and an
// exact-string match would otherwise create a duplicate client per format.
// Zambian mobile numbers are 9 digits after the leading 0/country code, so
// the last 9 digits are a reliable, country-code-agnostic matching key.
// Below 7 digits there's no validator-enforced minimum length on phone (see
// bookings/validators.ts), so a short/garbage entry returns null here and
// falls back to an exact match instead — risking a false-positive merge
// with an unrelated client is worse than occasionally missing a real match.
function phoneMatchKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 ? digits.slice(-9) : null
}

// Looks up a client by phone number, creating one if none exists.
// Used by the booking flow, which never shows a separate "create client" step.
export async function findOrCreateClient({ full_name, phone, nrc_or_passport, email, company }: ClientInput): Promise<string> {
  const matchKey = phoneMatchKey(phone)
  const { data: existing, error: findError } = matchKey
    ? await supabase.from('clients').select('id').ilike('phone', `%${matchKey}`).limit(1)
    : await supabase.from('clients').select('id').eq('phone', phone).limit(1)
  if (findError) throw findError
  if (existing?.[0]) return existing[0].id

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
