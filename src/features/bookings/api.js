import { supabase } from '@/shared/lib/supabase'
import { listApartmentIds } from '@/features/apartments/api'
import { findOrCreateClient } from '@/features/clients/api'
import { BOOKING_STATUS } from '@/shared/constants/status'

// The only module allowed to query the `bookings` table directly (other
// than the next_booking_ref/update_booking_status RPCs, which are also
// only called from here).
//
// Deliberately does not import features/payments/api.js: payments/api.js
// imports listBookingIdsForApartments from here to scope payments by
// location, so this module must not depend back on payments — the caller
// (NewBookingPage) records the optional first payment itself after
// createBooking() resolves, instead of this module orchestrating both.

const EXCLUSION_VIOLATION = '23P01'

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

export async function listBookings(filters = {}) {
  let aptIds = null
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
  return data ?? []
}

// Non-cancelled bookings shaped for the calendar view (a flat location_id on
// the apartment, since the calendar colors events by location).
export async function listBookingsForCalendar(locationId) {
  let aptIds = null
  if (locationId) {
    aptIds = await listApartmentIds(locationId)
    if (aptIds.length === 0) return []
  }

  let query = supabase.from('bookings').select(CALENDAR_SELECT).neq('booking_status', BOOKING_STATUS.CANCELLED)
  if (aptIds) query = query.in('apartment_id', aptIds)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getBooking(id) {
  const { data, error } = await supabase.from('bookings').select(DETAIL_SELECT).eq('id', id).single()
  if (error) throw error
  return data
}

// Resolves booking IDs for a set of apartments, used by payments/api.js to
// scope the payments list to a location without payments owning a query
// against the bookings table itself.
export async function listBookingIdsForApartments(apartmentIds) {
  if (apartmentIds.length === 0) return []
  const { data, error } = await supabase.from('bookings').select('id').in('apartment_id', apartmentIds)
  if (error) throw error
  return (data ?? []).map(b => b.id)
}

export async function searchBookingsByReference(searchTerm, locationId) {
  let aptIds = null
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
  return data ?? []
}

export async function hasOverlappingBooking(apartmentId, checkInDate, checkOutDate) {
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

async function nextBookingRef() {
  const { data, error } = await supabase.rpc('next_booking_ref')
  if (error) throw error
  return data
}

// Creates the booking itself (client upsert + reference generation + insert).
// Does not record a payment — see the note above on why that's the caller's
// job. The DB's exclusion constraint is the real guard against overlapping
// bookings; the caller-side hasOverlappingBooking() check above is just a
// fast pre-flight for a better error message in the common case.
export async function createBooking({ client, apartmentId, checkInDate, checkOutDate, ratePerDay, totalAmount, notes, createdBy }) {
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

export async function updateBookingStatus(bookingId, newStatus) {
  const { error } = await supabase.rpc('update_booking_status', {
    p_booking_id: bookingId,
    p_new_status: newStatus,
  })
  if (error) throw error
}

export async function cancelBooking(bookingId, reason, staffEmail, existingNotes) {
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
