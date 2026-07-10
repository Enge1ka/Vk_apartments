import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import * as clientsApi from '@/features/clients/api'
import * as apartmentsApi from '@/features/apartments/api'
import {
  cancelBooking, createBooking, extendRoom, shortenRoom, getBookingStatusSummary, hasOverlappingBooking,
  listRoomsForCalendar, listInHouse, listOutstandingBookings, updateRoomStatus,
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

describe('createBooking', () => {
  const args = {
    client: { full_name: 'John Banda', phone: '0970000000' },
    rooms: [{ apartmentId: 'apt-1', checkInDate: '2026-01-01', checkOutDate: '2026-01-04', ratePerDay: 100 }],
  }

  it('creates a booking via the RPC, finding or creating the client and mapping rooms', async () => {
    vi.spyOn(clientsApi, 'findOrCreateClient').mockResolvedValue('client-1')
    mockRpc.mockResolvedValue({ data: { booking_id: 'booking-1', booking_reference: 'VKL-2026-0001' }, error: null } as any)

    const result = await createBooking(args)

    expect(result).toEqual({ bookingId: 'booking-1', bookingRef: 'VKL-2026-0001' })
    expect(clientsApi.findOrCreateClient).toHaveBeenCalledWith(args.client)
    expect(mockRpc).toHaveBeenCalledWith('create_booking_with_apartments', expect.objectContaining({
      p_client_id: 'client-1',
      p_rooms: [{ apartment_id: 'apt-1', check_in_date: '2026-01-01', check_out_date: '2026-01-04', rate_per_day: 100 }],
    }))
  })

  it('translates a DB exclusion-violation into a friendly overlap message', async () => {
    vi.spyOn(clientsApi, 'findOrCreateClient').mockResolvedValue('client-1')
    mockRpc.mockResolvedValue({ data: null, error: { code: '23P01', message: 'exclusion violation' } } as any)

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

describe('listRoomsForCalendar', () => {
  it('excludes cancelled rooms and flattens the booking/apartment join', async () => {
    const chain = {
      select: () => chain,
      neq: vi.fn(() => Promise.resolve({
        data: [{
          id: 'r1', booking_id: 'b1', check_in_date: '2026-01-01', check_out_date: '2026-01-03', status: 'confirmed',
          booking: { booking_reference: 'VKL-1', client: { full_name: 'John' } },
          apartment: { apartment_number: '2A', location_id: 'loc-1', location: { id: 'loc-1', name: 'Nkana' } },
        }],
        error: null,
      })),
    }
    mockFrom.mockReturnValue(chain as any)

    const result = await listRoomsForCalendar(null)
    expect(chain.neq).toHaveBeenCalledWith('status', 'cancelled')
    expect(result[0]).toMatchObject({
      id: 'r1', booking_id: 'b1', booking_reference: 'VKL-1',
      client: { full_name: 'John' }, apartment: { apartment_number: '2A' },
    })
  })

  it('short-circuits when the location has no apartments', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listRoomsForCalendar('loc-1')).resolves.toEqual([])
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

describe('updateRoomStatus / cancelBooking', () => {
  it('calls the update_room_status RPC with the room id and new status', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await updateRoomStatus('room-1', 'checked_in')
    expect(mockRpc).toHaveBeenCalledWith('update_room_status', {
      p_booking_apartment_id: 'room-1', p_new_status: 'checked_in', p_notes: null,
    })
  })

  it('cancelBooking calls the cancel_booking RPC with a reason note', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await cancelBooking('booking-1', 'Guest cancelled', 'staff@vk.com')

    expect(mockRpc).toHaveBeenCalledWith('cancel_booking', expect.objectContaining({
      p_booking_id: 'booking-1',
    }))
    const callArgs = mockRpc.mock.calls.at(-1)?.[1] as { p_notes: string }
    expect(callArgs.p_notes).toContain('Guest cancelled')
    expect(callArgs.p_notes).toContain('staff@vk.com')
  })
})

describe('extendRoom', () => {
  it('calls extend_room with the new date; omitting the rate sends null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await extendRoom('room-1', '2026-01-10')
    expect(mockRpc).toHaveBeenCalledWith('extend_room', {
      p_booking_apartment_id: 'room-1', p_new_check_out_date: '2026-01-10', p_rate_per_day: null,
    })
  })

  it('passes a supplied rate through', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await extendRoom('room-1', '2026-01-10', 2000)
    expect(mockRpc).toHaveBeenCalledWith('extend_room', expect.objectContaining({ p_rate_per_day: 2000 }))
  })

  it('maps an exclusion violation to a friendly overlap message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23P01', message: 'exclusion' } } as any)
    await expect(extendRoom('room-1', '2026-01-10')).rejects.toThrow(/already booked for the extended dates/)
  })
})

describe('shortenRoom', () => {
  it('calls shorten_room with the new (earlier) check-out date', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any)
    await shortenRoom('room-1', '2026-01-02')
    expect(mockRpc).toHaveBeenCalledWith('shorten_room', {
      p_booking_apartment_id: 'room-1', p_new_check_out_date: '2026-01-02',
    })
  })

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'must be earlier' } } as any)
    await expect(shortenRoom('room-1', '2026-01-02')).rejects.toMatchObject({ message: 'must be earlier' })
  })
})
