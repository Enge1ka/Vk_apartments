import { supabase } from '@/shared/lib/supabase'
import { listApartmentIds } from '@/features/apartments/api'
import { findOrCreateClient } from '@/features/clients/api'
import { recordPayment } from '@/features/payments/api'
import { BOOKING_STATUS } from '@/shared/constants/status'

// The only module allowed to query the `bookings` table directly (other
// than the next_booking_ref/record_payment/update_booking_status RPCs,
// which are also only called from here and from payments/api.js).

const EXCLUSION_VIOLATION = '23P01'

const LIST_SELECT = `
  id, booking_reference, check_in_date, check_out_date,
  total_amount, amount_paid, outstanding_balance,
  booking_status, payment_status,
  client:clients(full_name, phone),
  apartment:apartments(apartment_number, type, location:locations(name))
`

const DETAIL_SELECT = `*, client:clients(*), apartment:apartments(*, location:locations(*))`

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

export async function getBooking(id) {
  const { data, error } = await supabase.from('bookings').select(DETAIL_SELECT).eq('id', id).single()
  if (error) throw error
  return data
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

// Creates a booking (and, if amountToPay > 0, its first payment) as one
// logical operation. The DB's exclusion constraint is the real guard against
// overlapping bookings; the caller-side hasOverlappingBooking() check above
// is just a fast pre-flight for a better error message in the common case.
export async function createBooking({ client, apartmentId, checkInDate, checkOutDate, ratePerDay, totalAmount, notes, createdBy, amountToPay, paymentMethod }) {
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

  let payment = null
  if (amountToPay > 0) {
    try {
      payment = await recordPayment({ bookingId: booking.id, amount: amountToPay, paymentMethod })
    } catch (err) {
      // The booking was created; only the payment failed. Surface the
      // booking id so the caller can route there instead of treating this
      // as a hard failure that loses the booking the user just made.
      const partialError = new Error('Booking created but payment failed. Please record the payment from the booking page.')
      partialError.bookingId = booking.id
      partialError.cause = err
      throw partialError
    }
  }

  return { bookingId: booking.id, bookingRef, payment }
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
