import { supabase } from '@/shared/lib/supabase'
import { listApartmentIds } from '@/features/apartments/api'
import type { Apartment } from '@/features/apartments/api'
import { findOrCreateClient } from '@/features/clients/api'
import type { Client, ClientInput } from '@/features/clients/api'
import { BOOKING_STATUS } from '@/shared/constants/status'
import type { BookingStatus, PaymentStatus } from '@/shared/constants/status'
import { todayLocalISO } from '@/shared/lib/bookingUtils'

// The only module allowed to query the `bookings` / `booking_apartments`
// tables directly (plus the booking RPCs, also only called from here).
//
// A booking is a header (client, one combined total, one balance, one payment
// ledger) with one or more rooms in `booking_apartments`. Each room has its
// own apartment, dates, rate, and status. The header's check_in/check_out are
// the span (earliest room in, latest room out) and booking_status is a rollup
// of the rooms — both maintained server-side by the booking RPCs.
//
// Deliberately does not import features/payments/api.ts: payments/api.ts
// imports listBookingIdsForApartments from here to scope payments by location,
// so this module must not depend back on payments.

const EXCLUSION_VIOLATION = '23P01'

export function subscribeToBookingChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel('bookings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_apartments' }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Minimal per-room shape carried by the list/summary views so the UI can show
// which apartment(s) a booking covers.
export interface RoomSummary {
  apartment: { apartment_number: string; type?: string; location: { name: string } | null } | null
}

// A full room line on a booking (detail view / receipts).
export interface BookingRoom {
  id: string
  apartment_id: string
  check_in_date: string
  check_out_date: string
  number_of_days: number
  rate_per_day: number
  line_total: number
  status: BookingStatus
  apartment: Apartment | null
}

export interface BookingListItem {
  id: string
  booking_reference: string
  check_in_date: string | null
  check_out_date: string | null
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  booking_status: BookingStatus
  payment_status: PaymentStatus
  client: { full_name: string; phone: string } | null
  rooms: RoomSummary[]
}

export interface Booking {
  id: string
  booking_reference: string
  client_id: string
  check_in_date: string | null
  check_out_date: string | null
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  payment_status: PaymentStatus
  booking_status: BookingStatus
  notes: string | null
  created_by: string | null
  created_at?: string
  client: Client | null
  rooms: BookingRoom[]
}

export interface BookingSearchResult {
  id: string
  booking_reference: string
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  check_in_date: string | null
  check_out_date: string | null
  client: { id: string; full_name: string; phone: string; nrc_or_passport: string | null } | null
  rooms: RoomSummary[]
}

// One calendar event per room (the calendar colours by location and shows
// each apartment's own stay).
export interface CalendarRoom {
  id: string
  booking_id: string
  booking_reference: string
  check_in_date: string
  check_out_date: string
  status: BookingStatus
  client: { full_name: string } | null
  apartment: { apartment_number: string; location_id: string; location: { id: string; name: string } | null } | null
}

export interface OutstandingBooking {
  id: string
  booking_reference: string
  outstanding_balance: number
  total_amount: number
  amount_paid: number
  check_in_date: string | null
  check_out_date: string | null
  payment_status: PaymentStatus
  client: { full_name: string; phone: string } | null
  rooms: RoomSummary[]
}

export interface UpcomingBooking {
  id: string
  check_in_date: string | null
  check_out_date: string | null
  outstanding_balance: number
  client: { full_name: string } | null
  rooms: RoomSummary[]
}

export interface InHouseBooking {
  id: string
  check_in_date: string | null
  check_out_date: string | null
  booking_status: BookingStatus
  outstanding_balance: number
  client: { full_name: string } | null
  rooms: RoomSummary[]
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

// One apartment on a new booking, with its own dates and rate.
export interface RoomInput {
  apartmentId: string
  checkInDate: string
  checkOutDate: string
  ratePerDay: number
}

export interface CreateBookingInput {
  client: ClientInput
  // Set when staff picked an existing client from search — links the booking to
  // that client directly instead of the phone/name find-or-create path.
  clientId?: string | null
  rooms: RoomInput[]
  notes?: string | null
}

export interface CreateBookingResult {
  bookingId: string
  bookingRef: string
}

const ROOM_SUMMARY = `rooms:booking_apartments(apartment:apartments(apartment_number, type, location:locations(name)))`

const LIST_SELECT = `
  id, booking_reference, check_in_date, check_out_date,
  total_amount, amount_paid, outstanding_balance,
  booking_status, payment_status,
  client:clients(full_name, phone),
  ${ROOM_SUMMARY}
`

const DETAIL_SELECT = `*, client:clients(*), rooms:booking_apartments(*, apartment:apartments(*, location:locations(*)))`

const SEARCH_SELECT = `
  id, booking_reference, total_amount, amount_paid, outstanding_balance, check_in_date, check_out_date,
  client:clients(id, full_name, phone, nrc_or_passport),
  ${ROOM_SUMMARY}
`

const OUTSTANDING_SELECT = `
  id, booking_reference, outstanding_balance, total_amount, amount_paid,
  check_in_date, check_out_date, payment_status,
  client:clients(full_name, phone),
  ${ROOM_SUMMARY}
`

const UPCOMING_SELECT = `
  id, check_in_date, check_out_date, outstanding_balance,
  client:clients(full_name),
  ${ROOM_SUMMARY}
`

const INHOUSE_SELECT = `
  id, check_in_date, check_out_date, booking_status, outstanding_balance,
  client:clients(full_name),
  ${ROOM_SUMMARY}
`

// Booking IDs that have at least one room in the given location — the
// replacement for the old `bookings.apartment_id IN (...)` scoping now that
// the apartment link lives on booking_apartments.
async function bookingIdsForLocation(locationId: string): Promise<string[]> {
  const aptIds = await listApartmentIds(locationId)
  if (aptIds.length === 0) return []
  const { data, error } = await supabase.from('booking_apartments').select('booking_id').in('apartment_id', aptIds)
  if (error) throw error
  return [...new Set((data ?? []).map(r => r.booking_id as string))]
}

async function listUpcomingByDate(
  dateColumn: 'check_in_date' | 'check_out_date',
  { locationId, fromDate, toDate, limit = 5 }: DateRangeFilters
): Promise<UpcomingBooking[]> {
  let bookingIds: string[] | null = null
  if (locationId) {
    bookingIds = await bookingIdsForLocation(locationId)
    if (bookingIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(UPCOMING_SELECT)
    .gte(dateColumn, fromDate)
    .lte(dateColumn, toDate)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .order(dateColumn)
    .limit(limit)
  if (bookingIds) query = query.in('id', bookingIds)

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

// Bookings whose stay covers today and that aren't checked out/cancelled, so a
// booking for a current stay reads as in-house rather than upcoming.
export async function listInHouse(locationId: string | null): Promise<InHouseBooking[]> {
  const today = todayLocalISO()

  let bookingIds: string[] | null = null
  if (locationId) {
    bookingIds = await bookingIdsForLocation(locationId)
    if (bookingIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(INHOUSE_SELECT)
    .lte('check_in_date', today)
    .gt('check_out_date', today)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .neq('booking_status', BOOKING_STATUS.CHECKED_OUT)
    .order('check_out_date')
  if (bookingIds) query = query.in('id', bookingIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as InHouseBooking[]
}

// A room whose stay is already over (check-out before today) but that was
// never checked out or cancelled — i.e. still 'confirmed' or 'checked_in'.
// These are the ones needing staff attention: a guest who overstayed or whom
// nobody processed, or a no-show that was never cancelled. The 10:00
// auto-checkout closes checked-in rooms on their checkout day, so anything
// lingering here is a genuine loose end (or the cron didn't run).
export interface OverdueRoom {
  id: string
  booking_id: string
  check_out_date: string
  status: BookingStatus
  client: { full_name: string } | null
  apartment: { apartment_number: string; location: { name: string } | null } | null
}

export async function listOverdueRooms(locationId: string | null): Promise<OverdueRoom[]> {
  const today = todayLocalISO()

  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase
    .from('booking_apartments')
    .select(`
      id, booking_id, check_out_date, status,
      booking:bookings(client:clients(full_name)),
      apartment:apartments(apartment_number, location:locations(name))
    `)
    .in('status', [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CHECKED_IN])
    .lt('check_out_date', today)
    .order('check_out_date')
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    booking_id: r.booking_id,
    check_out_date: r.check_out_date,
    status: r.status,
    client: r.booking?.client ?? null,
    apartment: r.apartment ?? null,
  }))
}

export async function listOutstandingBookings(locationId: string | null): Promise<OutstandingBooking[]> {
  let bookingIds: string[] | null = null
  if (locationId) {
    bookingIds = await bookingIdsForLocation(locationId)
    if (bookingIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(OUTSTANDING_SELECT)
    .gt('outstanding_balance', 0)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .order('outstanding_balance', { ascending: false })
  if (bookingIds) query = query.in('id', bookingIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as OutstandingBooking[]
}

// Counts for the Reports "Bookings" tab. "active" and "checkouts" can overlap
// (a checked-in booking due out today counts in both).
export async function getBookingStatusSummary(locationId: string | null): Promise<BookingStatusSummary> {
  let bookingIds: string[] | null = null
  if (locationId) {
    bookingIds = await bookingIdsForLocation(locationId)
    if (bookingIds.length === 0) return { active: 0, upcoming: 0, checkouts: 0, cancelled: 0 }
  }

  const today = todayLocalISO()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function countQuery(status: string, refine?: (q: any) => any) {
    let q = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', status)
    if (bookingIds) q = q.in('id', bookingIds)
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
  let bookingIds: string[] | null = null
  if (filters.locationId) {
    bookingIds = await bookingIdsForLocation(filters.locationId)
    if (bookingIds.length === 0) return []
  }

  let query = supabase.from('bookings').select(LIST_SELECT).order('created_at', { ascending: false })
  if (filters.status) query = query.eq('booking_status', filters.status)
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)
  if (bookingIds) query = query.in('id', bookingIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as BookingListItem[]
}

// One row per room for the calendar (each apartment's own stay), excluding
// cancelled rooms. Flattened from the booking_apartments → booking/apartment
// join into the shape the calendar consumes.
export async function listRoomsForCalendar(locationId: string | null): Promise<CalendarRoom[]> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase
    .from('booking_apartments')
    .select(`
      id, booking_id, check_in_date, check_out_date, status,
      booking:bookings(booking_reference, client:clients(full_name)),
      apartment:apartments(apartment_number, location_id, location:locations(id, name))
    `)
    .neq('status', BOOKING_STATUS.CANCELLED)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    booking_id: r.booking_id,
    booking_reference: r.booking?.booking_reference ?? '',
    check_in_date: r.check_in_date,
    check_out_date: r.check_out_date,
    status: r.status,
    client: r.booking?.client ?? null,
    apartment: r.apartment ?? null,
  }))
}

// A room occupying an apartment within a date window, for the availability
// grid. Non-cancelled rooms whose stay overlaps [fromDate, toDate).
export interface RoomOccupancy {
  apartment_id: string
  booking_id: string
  check_in_date: string
  check_out_date: string
  client_name: string | null
}

export async function listRoomOccupancy(locationId: string | null, fromDate: string, toDate: string): Promise<RoomOccupancy[]> {
  let aptIds: string[] | null = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase
    .from('booking_apartments')
    .select('apartment_id, booking_id, check_in_date, check_out_date, booking:bookings(client:clients(full_name))')
    .neq('status', BOOKING_STATUS.CANCELLED)
    .lt('check_in_date', toDate)
    .gt('check_out_date', fromDate)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    apartment_id: r.apartment_id,
    booking_id: r.booking_id,
    check_in_date: r.check_in_date,
    check_out_date: r.check_out_date,
    client_name: r.booking?.client?.full_name ?? null,
  }))
}

export async function getBooking(id: string): Promise<Booking> {
  const { data, error } = await supabase.from('bookings').select(DETAIL_SELECT).eq('id', id).single()
  if (error) throw error
  return data as unknown as Booking
}

// Booking IDs that include any of the given apartments — used by payments/api
// to scope the payments list to a location.
export async function listBookingIdsForApartments(apartmentIds: string[]): Promise<string[]> {
  if (apartmentIds.length === 0) return []
  const { data, error } = await supabase.from('booking_apartments').select('booking_id').in('apartment_id', apartmentIds)
  if (error) throw error
  return [...new Set((data ?? []).map(r => r.booking_id as string))]
}

export async function searchBookingsByReference(searchTerm: string, locationId: string | null): Promise<BookingSearchResult[]> {
  let bookingIds: string[] | null = null
  if (locationId) {
    bookingIds = await bookingIdsForLocation(locationId)
    if (bookingIds.length === 0) return []
  }

  let query = supabase
    .from('bookings')
    .select(SEARCH_SELECT)
    .ilike('booking_reference', `%${searchTerm}%`)
    .neq('booking_status', BOOKING_STATUS.CANCELLED)
    .limit(5)
  if (bookingIds) query = query.in('id', bookingIds)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as BookingSearchResult[]
}

// Fast pre-flight for a friendly message before the DB's per-room exclusion
// constraint has the final say. Checks a single apartment/date-range.
export async function hasOverlappingBooking(apartmentId: string, checkInDate: string, checkOutDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('booking_apartments')
    .select('id')
    .eq('apartment_id', apartmentId)
    .neq('status', BOOKING_STATUS.CANCELLED)
    .lt('check_in_date', checkOutDate)
    .gt('check_out_date', checkInDate)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

// Creates the booking header + all its rooms atomically via RPC (which also
// generates the reference and derives created_by server-side). Does not record
// a payment — the caller (NewBookingPage) does that after this resolves.
export async function createBooking({ client, clientId, rooms, notes }: CreateBookingInput): Promise<CreateBookingResult> {
  const resolvedClientId = clientId ?? await findOrCreateClient(client)

  const { data, error } = await supabase.rpc('create_booking_with_apartments', {
    p_client_id: resolvedClientId,
    p_rooms: rooms.map(r => ({
      apartment_id: r.apartmentId,
      check_in_date: r.checkInDate,
      check_out_date: r.checkOutDate,
      rate_per_day: r.ratePerDay,
    })),
    p_notes: notes || null,
  })

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      throw new Error('One of the selected apartments is already booked for those dates. Please adjust the dates or rooms.')
    }
    throw error
  }

  return { bookingId: data.booking_id, bookingRef: data.booking_reference }
}

// Per-room check-in / check-out.
export async function updateRoomStatus(roomId: string, newStatus: BookingStatus, notes?: string | null): Promise<void> {
  const { error } = await supabase.rpc('update_room_status', {
    p_booking_apartment_id: roomId,
    p_new_status: newStatus,
    p_notes: notes ?? null,
  })
  if (error) throw error
}

// Extends a room to a later check-out date. ratePerDay is optional — omit it
// to keep the current rate; passing one re-prices the whole room stay. The
// booking total/balance update server-side.
export async function extendRoom(roomId: string, newCheckOutDate: string, ratePerDay?: number): Promise<void> {
  const { error } = await supabase.rpc('extend_room', {
    p_booking_apartment_id: roomId,
    p_new_check_out_date: newCheckOutDate,
    p_rate_per_day: ratePerDay ?? null,
  })
  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      throw new Error('That apartment is already booked for the extended dates. Choose an earlier date or free the other booking.')
    }
    throw error
  }
}

// Shortens a room to an earlier check-out date (early departure). The booking
// total drops and the balance rolls up; if the guest had overpaid, that shows
// as a credit to refund. No overlap risk (shrinking a range can't collide).
export async function shortenRoom(roomId: string, newCheckOutDate: string): Promise<void> {
  const { error } = await supabase.rpc('shorten_room', {
    p_booking_apartment_id: roomId,
    p_new_check_out_date: newCheckOutDate,
  })
  if (error) throw error
}

// Corrects a not-yet-checked-in room's dates and rate (fix a mistake without
// cancel + rebook). Confirmed rooms only — the RPC enforces that.
export async function editRoom(roomId: string, checkInDate: string, checkOutDate: string, ratePerDay: number): Promise<void> {
  const { error } = await supabase.rpc('edit_room', {
    p_booking_apartment_id: roomId,
    p_check_in_date: checkInDate,
    p_check_out_date: checkOutDate,
    p_rate_per_day: ratePerDay,
  })
  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      throw new Error('That apartment is already booked for those dates. Choose different dates.')
    }
    throw error
  }
}

// Admin-only: cancels every room of a booking at once and releases the rooms.
export async function cancelBooking(bookingId: string, reason: string, staffEmail?: string | null): Promise<void> {
  const note = `Cancelled on ${todayLocalISO()} by ${staffEmail || 'staff'}: ${reason}`
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_notes: note,
  })
  if (error) throw error
}
