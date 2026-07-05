import { supabase } from '@/shared/lib/supabase'
import { listApartmentIds } from '@/features/apartments/api'
import { listBookingIdsForApartments } from '@/features/bookings/api'
import { todayLocalISO } from '@/shared/lib/bookingUtils'

// The only module allowed to query the `payments` table directly, or call
// the record_payment RPC.

export interface Payment {
  id: string
  booking_id: string
  client_id: string
  amount: number
  payment_date: string
  payment_method: string
  receipt_number: string
  recorded_by: string | null
  created_at?: string
  // Only present on rows returned by listPayments(), which joins bookings.
  booking?: {
    booking_reference: string
    outstanding_balance: number
    total_amount: number
    client: { full_name: string; phone: string; nrc_or_passport: string | null } | null
    apartment: { apartment_number: string; location: { name: string } | null } | null
  } | null
}

export interface PaymentFilters {
  locationId?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}

export interface RecordPaymentInput {
  bookingId: string
  amount: number
  paymentDate?: string
  paymentMethod: string
}

export interface RecordPaymentResult {
  receipt_number: string
}

const LIST_SELECT = `
  *, booking:bookings(
    booking_reference, outstanding_balance, total_amount,
    client:clients(full_name, phone, nrc_or_passport),
    apartment:apartments(apartment_number, location:locations(name))
  )
`

// filters: locationId (scopes via apartments -> bookings), dateFrom/dateTo
// (inclusive, on payment_date), limit. Reused as-is by the Payments page,
// Dashboard (today's revenue + recent payments), and Reports (date-range
// revenue) — previously each re-implemented the location-scoping chain.
export async function listPayments(filters: PaymentFilters = {}): Promise<Payment[]> {
  let bookingIds: string[] | null = null
  if (filters.locationId) {
    const aptIds = await listApartmentIds(filters.locationId)
    if (aptIds.length === 0) return []
    bookingIds = await listBookingIdsForApartments(aptIds)
    if (bookingIds.length === 0) return []
  }

  let query = supabase.from('payments').select(LIST_SELECT).order('created_at', { ascending: false })
  if (bookingIds) query = query.in('booking_id', bookingIds)
  if (filters.dateFrom) query = query.gte('payment_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('payment_date', filters.dateTo)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Payment[]
}

export async function listPaymentsForBooking(bookingId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as unknown as Payment[]
}

export async function recordPayment({ bookingId, amount, paymentDate, paymentMethod }: RecordPaymentInput): Promise<RecordPaymentResult> {
  const { data, error } = await supabase.rpc('record_payment', {
    p_booking_id: bookingId,
    p_amount: amount,
    p_payment_date: paymentDate || todayLocalISO(),
    p_payment_method: paymentMethod,
  })
  if (error) throw error
  return data
}
