import { supabase } from '@/shared/lib/supabase'

// The only module allowed to query the `payments` table directly, or call
// the record_payment RPC. Minimal for now (booking creation + booking detail
// need it); expanded when the Payments page itself is migrated.

export async function listPaymentsForBooking(bookingId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function recordPayment({ bookingId, amount, paymentDate, paymentMethod }) {
  const { data, error } = await supabase.rpc('record_payment', {
    p_booking_id: bookingId,
    p_amount: amount,
    p_payment_date: paymentDate || new Date().toISOString().split('T')[0],
    p_payment_method: paymentMethod,
  })
  if (error) throw error
  return data
}
