import { supabase } from '@/shared/lib/supabase'

// The only module allowed to query the `clients` table directly.

export async function listClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*, bookings(id, booking_reference, total_amount, booking_status, check_in_date)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Looks up a client by phone number, creating one if none exists.
// Used by the booking flow, which never shows a separate "create client" step.
export async function findOrCreateClient({ full_name, phone, nrc_or_passport, email, company }) {
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
