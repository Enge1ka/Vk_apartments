import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import * as apartmentsApi from '@/features/apartments/api'
import * as bookingsApi from '@/features/bookings/api'
import { listPayments, recordPayment, recordRefund } from './api'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// See features/bookings/api.test.ts for why vi.mocked() + `any` chain fakes,
// rather than fighting Supabase's deeply generic builder types.
const mockFrom = vi.mocked(supabase.from)
const mockRpc = vi.mocked(supabase.rpc)

afterEach(() => {
  vi.restoreAllMocks()
  mockFrom.mockReset()
  mockRpc.mockReset()
})

describe('listPayments', () => {
  it('lists all payments when no location filter is given', async () => {
    const chain = { select: () => chain, order: () => Promise.resolve({ data: [{ id: 'p1' }], error: null }) }
    mockFrom.mockReturnValue(chain as any)

    await expect(listPayments()).resolves.toEqual([{ id: 'p1' }])
  })

  it('scopes to bookings for the location, short-circuiting when there are none', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listPayments({ locationId: 'loc-1' })).resolves.toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('filters by resolved booking ids when the location has apartments and bookings', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue(['apt-1'])
    vi.spyOn(bookingsApi, 'listBookingIdsForApartments').mockResolvedValue(['booking-1'])
    const chain = { select: () => chain, order: () => chain, in: vi.fn(() => Promise.resolve({ data: [{ id: 'p1' }], error: null })) }
    mockFrom.mockReturnValue(chain as any)

    const result = await listPayments({ locationId: 'loc-1' })
    expect(chain.in).toHaveBeenCalledWith('booking_id', ['booking-1'])
    expect(result).toEqual([{ id: 'p1' }])
  })

  it('applies dateFrom/dateTo/limit when given', async () => {
    const chain = {
      select: () => chain, order: () => chain,
      gte: vi.fn(() => chain), lte: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
    mockFrom.mockReturnValue(chain as any)

    await listPayments({ dateFrom: '2026-01-01', dateTo: '2026-01-31', limit: 5 })

    expect(chain.gte).toHaveBeenCalledWith('payment_date', '2026-01-01')
    expect(chain.lte).toHaveBeenCalledWith('payment_date', '2026-01-31')
    expect(chain.limit).toHaveBeenCalledWith(5)
  })
})

describe('recordPayment', () => {
  it('calls the record_payment RPC and returns its result', async () => {
    mockRpc.mockResolvedValue({ data: { receipt_number: 'RCP-2026-0001' }, error: null } as any)

    const result = await recordPayment({ bookingId: 'booking-1', amount: 100, paymentMethod: 'cash' })

    expect(mockRpc).toHaveBeenCalledWith('record_payment', expect.objectContaining({
      p_booking_id: 'booking-1', p_amount: 100, p_payment_method: 'cash',
    }))
    expect(result).toEqual({ receipt_number: 'RCP-2026-0001' })
  })

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'exceeds balance' } } as any)
    await expect(recordPayment({ bookingId: 'booking-1', amount: 9999, paymentMethod: 'cash' }))
      .rejects.toMatchObject({ message: 'exceeds balance' })
  })
})

describe('recordRefund', () => {
  it('calls the record_refund RPC with amount, method, and reason', async () => {
    mockRpc.mockResolvedValue({ data: { receipt_number: 'RFD-2026-0001' }, error: null } as any)

    const result = await recordRefund({ bookingId: 'booking-1', amount: 50, paymentMethod: 'mobile_money', reason: 'Early checkout' })

    expect(mockRpc).toHaveBeenCalledWith('record_refund', expect.objectContaining({
      p_booking_id: 'booking-1', p_amount: 50, p_payment_method: 'mobile_money', p_reason: 'Early checkout',
    }))
    expect(result).toEqual({ receipt_number: 'RFD-2026-0001' })
  })

  it('sends a null reason when none is given', async () => {
    mockRpc.mockResolvedValue({ data: { receipt_number: 'RFD-2026-0002' }, error: null } as any)
    await recordRefund({ bookingId: 'booking-1', amount: 50, paymentMethod: 'cash' })
    expect(mockRpc).toHaveBeenCalledWith('record_refund', expect.objectContaining({ p_reason: null }))
  })
})
