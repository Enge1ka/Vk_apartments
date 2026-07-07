import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import * as clientsApi from '@/features/clients/api'
import * as apartmentsApi from '@/features/apartments/api'
import {
  cancelBooking, createBooking, getBookingStatusSummary, hasOverlappingBooking,
  listBookingsForCalendar, listInHouse, listOutstandingBookings, updateBookingStatus,
} from './api'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// The real supabase.from()/rpc() types are deeply generic Postgrest builder
// types that these deliberately loose test fakes were never going to match —
// vi.mocked() gives back the mock-method surface (mockReturnValue etc.)
// without fighting that. The fake chain/result shapes themselves are cast
// `as any` below since they intentionally only implement what each test uses.
const mockFrom = vi.mocked(supabase.from)
const mockRpc = vi.mocked(supabase.rpc)

afterEach(() => {
  vi.restoreAllMocks()
  mockFrom.mockReset()
  mockRpc.mockReset()
})

function mockBookingInsert(result: { data: { id: string } | null; error: { code?: string; message?: string } | null }) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'bookings') throw new Error(`Unexpected table: ${table}`)
    return { insert: () => ({ select: () => ({ single: () => Promise.resolve(result) }) }) } as any
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
    mockRpc.mockResolvedValue({ data: 'VKL-2026-0001', error: null } as any)
    mockBookingInsert({ data: { id: 'booking-1' }, error: null })

    const result = await createBooking(args)

    expect(result).toEqual({ bookingId: 'booking-1', bookingRef: 'VKL-2026-0001' })
    expect(clientsApi.findOrCreateClient).toHaveBeenCalledWith(args.client)
    expect(mockRpc).toHaveBeenCalledWith('next_booking_ref')
  })

  it('translates a DB exclusion-violation into a friendly overlap message', async () => {
    vi.spyOn(clientsApi, 'findOrCreateClient').mockResolvedValue('client-1')
    mockRpc.mockResolvedValue({ data: 'VKL-2026-0001', error: null } as any)
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
    mockFrom.mockReturnValue(chain as any)

    await expect(hasOverlappingBooking('apt-1', '2026-01-01', '2026-01-04')).resolves.toBe(true)
  })

  it('returns false when there is no overlap', async () => {
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, lt: () => chain,
      gt: () => Promise.resolve({ data: [], error: null }),
    }
    mockFrom.mockReturnValue(chain as any)

    await expect(hasOverlappingBooking('apt-1', '2026-01-01', '2026-01-04')).resolves.toBe(false)
  })
})

describe('listBookingsForCalendar', () => {
  it('excludes cancelled bookings and is unscoped without a location', async () => {
    const chain = { select: () => chain, neq: vi.fn(() => Promise.resolve({ data: [{ id: 'b1' }], error: null })) }
    mockFrom.mockReturnValue(chain as any)

    const result = await listBookingsForCalendar(null)
    expect(chain.neq).toHaveBeenCalledWith('booking_status', 'cancelled')
    expect(result).toEqual([{ id: 'b1' }])
  })

  it('short-circuits when the location has no apartments', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listBookingsForCalendar('loc-1')).resolves.toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('listOutstandingBookings', () => {
  it('filters to a positive outstanding balance, excludes cancelled, orders descending', async () => {
    const chain = {
      select: () => chain, gt: vi.fn(() => chain), neq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: [{ id: 'b1' }], error: null })),
    }
    mockFrom.mockReturnValue(chain as any)

    const result = await listOutstandingBookings(null)
    expect(chain.gt).toHaveBeenCalledWith('outstanding_balance', 0)
    expect(chain.order).toHaveBeenCalledWith('outstanding_balance', { ascending: false })
    expect(result).toEqual([{ id: 'b1' }])
  })

  it('short-circuits when the location has no apartments', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listOutstandingBookings('loc-1')).resolves.toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('listInHouse', () => {
  it('bounds the stay around today and excludes cancelled/checked-out', async () => {
    const chain: any = {
      select: () => chain,
      lte: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: [{ id: 'b1' }], error: null })),
    }
    mockFrom.mockReturnValue(chain)

    const result = await listInHouse(null)

    // check-in on/before today, check-out strictly after today
    expect(chain.lte).toHaveBeenCalledWith('check_in_date', expect.any(String))
    expect(chain.gt).toHaveBeenCalledWith('check_out_date', expect.any(String))
    // both terminal statuses filtered out
    expect(chain.neq).toHaveBeenCalledWith('booking_status', 'cancelled')
    expect(chain.neq).toHaveBeenCalledWith('booking_status', 'checked_out')
    expect(result).toEqual([{ id: 'b1' }])
  })

  it('short-circuits when the location has no apartments', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listInHouse('loc-1')).resolves.toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('getBookingStatusSummary', () => {
  it('queries the bookings table once per status and shapes the result', async () => {
    const chain: any = { select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain }
    chain.then = (resolve: (value: { count: number }) => void) => resolve({ count: 2 })
    mockFrom.mockReturnValue(chain)

    const result = await getBookingStatusSummary(null)
    expect(mockFrom).toHaveBeenCalledTimes(4)
    expect(mockFrom).toHaveBeenCalledWith('bookings')
    expect(result).toEqual({ active: 2, upcoming: 2, checkouts: 2, cancelled: 2 })
  })

  it('returns all zeros when the location has no apartments', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(getBookingStatusSummary('loc-1')).resolves.toEqual({ active: 0, upcoming: 0, checkouts: 0, cancelled: 0 })
  })
})

describe('updateBookingStatus / cancelBooking', () => {
  it('calls the update_booking_status RPC with the new status', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await updateBookingStatus('booking-1', 'checked_in')
    expect(mockRpc).toHaveBeenCalledWith('update_booking_status', {
      p_booking_id: 'booking-1', p_new_status: 'checked_in',
    })
  })

  it('cancelBooking appends a cancellation note and sets status to cancelled', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await cancelBooking('booking-1', 'Guest cancelled', 'staff@vk.com', 'Existing note')

    expect(mockRpc).toHaveBeenCalledWith('update_booking_status', expect.objectContaining({
      p_booking_id: 'booking-1',
      p_new_status: 'cancelled',
      p_notes: expect.stringContaining('Existing note'),
    }))
    const callArgs = mockRpc.mock.calls.at(-1)?.[1] as { p_notes: string }
    expect(callArgs.p_notes).toContain('Guest cancelled')
    expect(callArgs.p_notes).toContain('staff@vk.com')
  })
})
