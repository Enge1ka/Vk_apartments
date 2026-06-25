import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import * as clientsApi from '@/features/clients/api'
import * as apartmentsApi from '@/features/apartments/api'
import { cancelBooking, createBooking, hasOverlappingBooking, listBookingsForCalendar, updateBookingStatus } from './api'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

afterEach(() => {
  vi.restoreAllMocks()
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

function mockBookingInsert(result) {
  supabase.from.mockImplementation((table) => {
    if (table !== 'bookings') throw new Error(`Unexpected table: ${table}`)
    return { insert: () => ({ select: () => ({ single: () => Promise.resolve(result) }) }) }
  })
}

describe('createBooking', () => {
  const args = {
    client: { full_name: 'John Banda', phone: '0970000000' },
    apartmentId: 'apt-1',
    checkInDate: '2026-01-01',
    checkOutDate: '2026-01-04',
    ratePerDay: 100,
    totalAmount: 300,
    createdBy: 'user-1',
  }

  it('creates a booking, finding or creating the client and generating a reference', async () => {
    vi.spyOn(clientsApi, 'findOrCreateClient').mockResolvedValue('client-1')
    supabase.rpc.mockResolvedValue({ data: 'VKL-2026-0001', error: null })
    mockBookingInsert({ data: { id: 'booking-1' }, error: null })

    const result = await createBooking(args)

    expect(result).toEqual({ bookingId: 'booking-1', bookingRef: 'VKL-2026-0001' })
    expect(clientsApi.findOrCreateClient).toHaveBeenCalledWith(args.client)
    expect(supabase.rpc).toHaveBeenCalledWith('next_booking_ref')
  })

  it('translates a DB exclusion-violation into a friendly overlap message', async () => {
    vi.spyOn(clientsApi, 'findOrCreateClient').mockResolvedValue('client-1')
    supabase.rpc.mockResolvedValue({ data: 'VKL-2026-0001', error: null })
    mockBookingInsert({ data: null, error: { code: '23P01', message: 'exclusion violation' } })

    await expect(createBooking(args)).rejects.toThrow(/already booked for those dates/)
  })
})

describe('hasOverlappingBooking', () => {
  it('returns true when a non-cancelled booking overlaps the date range', async () => {
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, lt: () => chain,
      gt: () => Promise.resolve({ data: [{ id: 'existing' }], error: null }),
    }
    supabase.from.mockReturnValue(chain)

    await expect(hasOverlappingBooking('apt-1', '2026-01-01', '2026-01-04')).resolves.toBe(true)
  })

  it('returns false when there is no overlap', async () => {
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, lt: () => chain,
      gt: () => Promise.resolve({ data: [], error: null }),
    }
    supabase.from.mockReturnValue(chain)

    await expect(hasOverlappingBooking('apt-1', '2026-01-01', '2026-01-04')).resolves.toBe(false)
  })
})

describe('listBookingsForCalendar', () => {
  it('excludes cancelled bookings and is unscoped without a location', async () => {
    const chain = { select: () => chain, neq: vi.fn(() => Promise.resolve({ data: [{ id: 'b1' }], error: null })) }
    supabase.from.mockReturnValue(chain)

    const result = await listBookingsForCalendar(null)
    expect(chain.neq).toHaveBeenCalledWith('booking_status', 'cancelled')
    expect(result).toEqual([{ id: 'b1' }])
  })

  it('short-circuits when the location has no apartments', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listBookingsForCalendar('loc-1')).resolves.toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('updateBookingStatus / cancelBooking', () => {
  it('calls the update_booking_status RPC with the new status', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await updateBookingStatus('booking-1', 'checked_in')
    expect(supabase.rpc).toHaveBeenCalledWith('update_booking_status', {
      p_booking_id: 'booking-1', p_new_status: 'checked_in',
    })
  })

  it('cancelBooking appends a cancellation note and sets status to cancelled', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await cancelBooking('booking-1', 'Guest cancelled', 'staff@vk.com', 'Existing note')

    expect(supabase.rpc).toHaveBeenCalledWith('update_booking_status', expect.objectContaining({
      p_booking_id: 'booking-1',
      p_new_status: 'cancelled',
      p_notes: expect.stringContaining('Existing note'),
    }))
    const callArgs = supabase.rpc.mock.calls.at(-1)[1]
    expect(callArgs.p_notes).toContain('Guest cancelled')
    expect(callArgs.p_notes).toContain('staff@vk.com')
  })
})
