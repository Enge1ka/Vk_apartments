import { supabase } from '@/shared/lib/supabase'
import { listApartmentIds } from '@/features/apartments/api'
import type { Apartment } from '@/features/apartments/api'
import { findOrCreateClient } from '@/features/clients/api'
import type { Client, ClientInput } from '@/features/clients/api'
import { BOOKING_STATUS } from '@/shared/constants/status'
import type { BookingStatus, PaymentStatus } from '@/shared/constants/status'

// The only module allowed to query the `bookings` table directly (other
// than the next_booking_ref/update_booking_status RPCs, which are also
// only called from here).
//
// Deliberately does not import features/payments/api.ts: payments/api.ts
// imports listBookingIdsForApartments from here to scope payments by
// location, so this module must not depend back on payments — the caller
// (NewBookingPage) records the optional first payment itself after
// createBooking() resolves, instead of this module orchestrating both.

const EXCLUSION_VIOLATION = '23P01'

export interface BookingListItem {
  id: string
  booking_reference: string
  check_in_date: string
  check_out_date: string
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  booking_status: BookingStatus
  payment_status: PaymentStatus
  client: { full_name: string; phone: string } | null
  apartment: { apartment_number: string; type: string; location: { name: string } | null } | null
}

export interface Booking {
  id: string
  booking_reference: string
  client_id: string
  apartment_id: string
  check_in_date: string
  check_out_date: string
  number_of_days: number
  rate_per_day: number
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  payment_status: PaymentStatus
  booking_status: BookingStatus
  notes: string | null
  created_by: string | null
  created_at?: string
  client: Client | null
  apartment: Apartment | null
}

export interface BookingSearchResult {
  id: string
  booking_reference: string
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  check_in_date: string
  check_out_date: string
  client: { id: string; full_name: string; phone: string; nrc_or_passport: string | null } | null
  apartment: { apartment_number: string; location: { name: string } | null } | null
}

export interface CalendarBooking {
  id: string
  booking_reference: string
  check_in_date: string
  check_out_date: string
  booking_status: BookingStatus
  client: { full_name: string } | null
  apartment: { apartment_number: string; location_id: string; location: { id: string; name: string } | null } | null
}

export interface OutstandingBooking {
  id: string
  booking_reference: string
  outstanding_balance: number
  total_amount: number
  amount_paid: number
  check_in_date: string
  check_out_date: string
  payment_status: PaymentStatus
  client: { full_name: string; phone: string } | null
  apartment: { apartment_number: string; location: { name: string } | null } | null
}

export interface UpcomingBooking {
  id: string
  check_in_date: string
  check_out_date: string
  outstanding_balance: number
  client: { full_name: string } | null
  apartment: { apartment_number: string; location: { name: string } | null } | null
}

export interface BookingFilters {
  locationId?: string
  status?: string
  paymentStatus?: string
}

export interface DateRangeFilters {
  locationId?: string
  fromDate: string
  toDate: string
  limit?: number
}

export interface BookingStatusSummary {
  active: number
  upcoming: number
  checkouts: number
  cancelled: number
}

export interface CreateBookingInput {
  client: ClientInput
  apartmentId: string
  checkInDate: string
  checkOutDate: string
  ratePerDay: number
  totalAmount: number
  notes?: string | null
  createdBy?: string | null
}

export interface CreateBookingResult {
  bookingId: string
  bookingRef: string
}

const LIST_SELECT = `
  id, booking_reference, check_in_date, check_out_date,
  total_amount, amount_paid, outstanding_balance,
  booking_status, payment_status,
  client:clients(full_name, phone),
  apartment:apartments(apartment_number, type, location:locations(name))
`

const DETAIL_SELECT = `*, client:clients(*), apartment:apartments(*, location:locations(*))`

const SEARCH_SELECT = `
  id, booking_reference, total_amount, amount_paid, outstanding_balance, check_in_date, check_out_date,
  client:clients(id, full_name, phone, nrc_or_passport),
  apartment:apartments(apartment_number, location:locations(name))
`

const CALENDAR_SELECT = `
  id, booking_reference, check_in_date, check_out_date, booking_status,
  client:clients(full_name),
  apartment:apartments(apartment_number, location_id, location:locations(id, name))
`

const OUTSTANDING_SELECT = `
  id, booking_reference, outstanding_balance, total_amount, amount_paid,
  check_in_date, check_out_date, payment_status,
  client:clients(full_name, phone),
  apartment:apartments(apartment_number, location:locations(name))
`

const UPCOMING_SELECT = `
  id, check_in_date, check_out_date, outstanding_balance,
  client:clients(full_name),
  apartment:apartments(apartment_number, location:locations(name))
`

async function listUpcomingByDate(
  dateColumn: 'check_in_date' | 'check_out_date',
  { locationId, fromDate, toDate, limit = 5 }: DateRangeFilters
): Promise<UpcomingBooking[]> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(UPCOMING_SELECT)
    .gte(dateColumn, fromDate)
    .lte(dateColumn, toDate)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .order(dateColumn)
    .limit(limit)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as UpcomingBooking[]
}

export function listUpcomingCheckIns(filters: DateRangeFilters): Promise<UpcomingBooking[]> {
  return listUpcomingByDate('check_in_date', filters)
}

export function listUpcomingCheckOuts(filters: DateRangeFilters): Promise<UpcomingBooking[]> {
  return listUpcomingByDate('check_out_date', filters)
}

export async function listOutstandingBookings(locationId: string | null): Promise<OutstandingBooking[]> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(OUTSTANDING_SELECT)
    .gt('outstanding_balance', 0)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .order('outstanding_balance', { ascending: false })
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as OutstandingBooking[]
}

// Counts only (no row data) — used for the Reports "Bookings" tab summary
// cards. "active" and "checkouts" can overlap (a checked-in booking due
// out today counts in both), matching the original metric's intent.
export async function getBookingStatusSummary(locationId: string | null): Promise<BookingStatusSummary> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return { active: 0, upcoming: 0, checkouts: 0, cancelled: 0 }
  }

  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function countQuery(status: string, refine?: (q: any) => any) {
    let q = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', status)
    if (aptIds) q = q.in('apartment_id', aptIds)
    return refine ? refine(q) : q
  }

  const [activeRes, upcomingRes, checkoutRes, cancelRes] = await Promise.all([
    countQuery(BOOKING_STATUS.CHECKED_IN),
    countQuery(BOOKING_STATUS.CONFIRMED, q => q.gte('check_in_date', today)),
    countQuery(BOOKING_STATUS.CHECKED_IN, q => q.lte('check_out_date', today)),
    countQuery(BOOKING_STATUS.CANCELLED),
  ])

  return {
    active: activeRes.count || 0,
    upcoming: upcomingRes.count || 0,
    checkouts: checkoutRes.count || 0,
    cancelled: cancelRes.count || 0,
  }
}

export async function listBookings(filters: BookingFilters = {}): Promise<BookingListItem[]> {
  let aptIds: string[] | null = null
  if (filters.locationId) {
    aptIds = await listApartmentIds(filters.locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase.from('bookings').select(LIST_SELECT).order('created_at', { ascending: false })
  if (filters.status) query = query.eq('booking_status', filters.status)
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as BookingListItem[]
}

// Non-cancelled bookings shaped for the calendar view (a flat location_id on
// the apartment, since the calendar colors events by location).
export async function listBookingsForCalendar(locationId: string | null): Promise<CalendarBooking[]> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase.from('bookings').select(CALENDAR_SELECT).neq('booking_status', BOOKING_STATUS.CANCELLED)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as CalendarBooking[]
}

export async function getBooking(id: string): Promise<Booking> {
  const { data, error } = await supabase.from('bookings').select(DETAIL_SELECT).eq('id', id).single()
  if (error) throw error
  return data as unknown as Booking
}

// Resolves booking IDs for a set of apartments, used by payments/api.ts to
// scope the payments list to a location without payments owning a query
// against the bookings table itself.
export async function listBookingIdsForApartments(apartmentIds: string[]): Promise<string[]> {
  if (apartmentIds.length === 0) return []
  const { data, error } = await supabase.from('bookings').select('id').in('apartment_id', apartmentIds)
  if (error) throw error
  return (data ?? []).map(b => b.id)
}

export async function searchBookingsByReference(searchTerm: string, locationId: string | null): Promise<BookingSearchResult[]> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(SEARCH_SELECT)
    .ilike('booking_reference', `%${searchTerm}%`)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .limit(5)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as BookingSearchResult[]
}

export async function hasOverlappingBooking(apartmentId: string, checkInDate: string, checkOutDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('apartment_id', apartmentId)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .lt('check_in_date', checkOutDate)
    .gt('check_out_date', checkInDate)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

async function nextBookingRef(): Promise<string> {
  const { data, error } = await supabase.rpc('next_booking_ref')
  if (error) throw error
  return data
}

// Creates the booking itself (client upsert + reference generation + insert).
// Does not record a payment — see the note above on why that's the caller's
// job. The DB's exclusion constraint is the real guard against overlapping
// bookings; the caller-side hasOverlappingBooking() check above is just a
// fast pre-flight for a better error message in the common case.
export async function createBooking({
  client, apartmentId, checkInDate, checkOutDate, ratePerDay, totalAmount, notes, createdBy,
}: CreateBookingInput): Promise<CreateBookingResult> {
  const clientId = await findOrCreateClient(client)
  const bookingRef = await nextBookingRef()

  const { data: booking, error } = await supabase.from('bookings').insert({
    booking_reference: bookingRef,
    client_id: clientId,
    apartment_id: apartmentId,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    rate_per_day: ratePerDay,
    total_amount: totalAmount,
    amount_paid: 0,
    payment_status: 'unpaid',
    booking_status: BOOKING_STATUS.CONFIRMED,
    notes: notes || null,
    created_by: createdBy,
  }).select('id').single()

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      throw new Error('This apartment is already booked for those dates. Please choose different dates or another apartment.')
    }
    throw error
  }

  return { bookingId: booking.id, bookingRef }
}

export async function updateBookingStatus(bookingId: string, newStatus: BookingStatus): Promise<void> {
  const { error } = await supabase.rpc('update_booking_status', {
    p_booking_id: bookingId,
    p_new_status: newStatus,
  })
  if (error) throw error
}

export async function cancelBooking(bookingId: string, reason: string, staffEmail?: string | null, existingNotes?: string | null): Promise<void> {
  const notes = [
    existingNotes,
    `Cancelled on ${new Date().toISOString().split('T')[0]} by ${staffEmail || 'staff'}: ${reason}`,
  ].filter(Boolean).join('\n')

  const { error } = await supabase.rpc('update_booking_status', {
    p_booking_id: bookingId,
    p_new_status: BOOKING_STATUS.CANCELLED,
    p_notes: notes,
  })
  if (error) throw error
}
