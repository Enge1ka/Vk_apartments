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

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Looks up a client for a booking, creating one if none matches.
// Used by the booking flow, which never shows a separate "create client" step.
//
// Reuses an existing client ONLY when the phone AND the name match. Matching on
// phone alone (the old behaviour) silently attached a booking for a different
// guest to whichever client already had that number — so two bookings entered
// with different names but a shared/mistyped phone both showed up as the same
// earlier client, discarding the names actually typed. Requiring the name to
// match too means a genuinely different guest gets their own client; the only
// cost is an occasional duplicate when the same person's name is spelled
// differently, which is far safer than merging two different people.
export async function findOrCreateClient({ full_name, phone, nrc_or_passport, email, company }: ClientInput): Promise<string> {
  const matchKey = phoneMatchKey(phone)
  const { data: candidates, error: findError } = matchKey
    ? await supabase.from('clients').select('id, full_name').ilike('phone', `%${matchKey}`)
    : await supabase.from('clients').select('id, full_name').eq('phone', phone)
  if (findError) throw findError

  const wanted = normalizeName(full_name)
  const match = (candidates ?? []).find(c => normalizeName(c.full_name ?? '') === wanted)
  if (match) return match.id

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
