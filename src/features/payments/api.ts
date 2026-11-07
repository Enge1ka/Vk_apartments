import { supabase } from '@/shared/lib/supabase'
import { todayLocalISO } from '@/shared/lib/bookingUtils'

// The only module allowed to query the `payments` table directly, or call
// the record_payment RPC.

export type PaymentType = 'payment' | 'refund'

export interface Payment {
  id: string
  booking_id: string
  client_id: string
  amount: number
  payment_date: string
  payment_method: string
  receipt_number: string
  // 'refund' rows represent money returned to the guest; they carry a positive
  // amount but reduce the booking's amount_paid. Older rows may be undefined
  // (before the payment_type column) — treat those as 'payment'.
  payment_type?: PaymentType
  notes?: string | null
  recorded_by: string | null
  created_at?: string
  // Only present on rows returned by listPayments(), which joins bookings.
  // A booking can cover several rooms, so this carries the room set rather
  // than a single apartment.
  booking?: {
    booking_reference: string
    outstanding_balance: number
    total_amount: number
    client: { full_name: string; phone: string; nrc_or_passport: string | null } | null
    rooms: { apartment: { apartment_number: string; location: { name: string } | null } | null }[]
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
    rooms:booking_apartments(apartment:apartments(apartment_number, location:locations(name)))
  )
`

// Keeps only payments whose booking has a room at the location. The database
// does the join, so the URL stays the same size however many bookings the
// location has (see LOCATION_SCOPE in bookings/api.ts for why an ID list broke).
// The `loc_scope` embed is only there to filter and callers ignore it.
const LOCATION_SCOPE = `loc_scope:bookings!inner(rooms:booking_apartments!inner(apartment:apartments!inner(location_id)))`
export const PAYMENT_LOCATION_SCOPE_FILTER = 'loc_scope.rooms.apartment.location_id'

// filters: locationId (payments for bookings with a room at that location),
// dateFrom/dateTo (inclusive, on payment_date), limit. Reused as-is by the
// Payments page, Dashboard (today's revenue + recent payments), and Reports
// (date-range revenue).
export async function listPayments(filters: PaymentFilters = {}): Promise<Payment[]> {
  const select = filters.locationId ? `${LIST_SELECT}, ${LOCATION_SCOPE}` : LIST_SELECT
  let query = supabase.from('payments').select(select).order('created_at', { ascending: false })
  if (filters.locationId) query = query.eq(PAYMENT_LOCATION_SCOPE_FILTER, filters.locationId)
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

export interface RecordRefundInput {
  bookingId: string
  amount: number
  paymentMethod: string
  reason?: string | null
  paymentDate?: string
}

// Admin-only: records money returned to the guest. Reduces amount_paid; can't
// exceed what was paid (the RPC enforces both).
export async function recordRefund({ bookingId, amount, paymentMethod, reason, paymentDate }: RecordRefundInput): Promise<RecordPaymentResult> {
  const { data, error } = await supabase.rpc('record_refund', {
    p_booking_id: bookingId,
    p_amount: amount,
    p_payment_date: paymentDate || todayLocalISO(),
    p_payment_method: paymentMethod,
    p_reason: reason ?? null,
  })
  if (error) throw error
  return data
}
