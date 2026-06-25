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
