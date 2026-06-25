import { supabase } from '@/shared/lib/supabase'
import { listApartmentIds } from '@/features/apartments/api'
import { listBookingIdsForApartments } from '@/features/bookings/api'

// The only module allowed to query the `payments` table directly, or call
// the record_payment RPC.

const LIST_SELECT = `
  *, booking:bookings(
    booking_reference, outstanding_balance, total_amount,
    client:clients(full_name, phone, nrc_or_passport),
    apartment:apartments(apartment_number, location:locations(name))
  )
`

export async function listPayments(filters = {}) {
  let bookingIds = null
  if (filters.locationId) {
    const aptIds = await listApartmentIds(filters.locationId)
    if (aptIds.length === 0) return []
    bookingIds = await listBookingIdsForApartments(aptIds)
    if (bookingIds.length === 0) return []
  }

  let query = supabase.from('payments').select(LIST_SELECT).order('created_at', { ascending: false })
  if (bookingIds) query = query.in('booking_id', bookingIds)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

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
