import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import { listPayments, recordPayment, recordRefund, PAYMENT_LOCATION_SCOPE_FILTER } from './api'

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

  // Regression: the old version sent every booking ID at the location as
  // `booking_id=in.(...)`. Past ~640 bookings the URL hit ~25 KB and the API
  // rejected it with a 400. Now it's one query filtered by the database.
  it('scopes to a location in a single query, without a booking ID list', async () => {
    // No `in` on the fake chain: a `booking_id=in.(...)` filter would throw here.
    const chain = {
      select: vi.fn(() => chain), order: () => chain,
      eq: vi.fn(() => Promise.resolve({ data: [{ id: 'p1' }], error: null })),
    }
    mockFrom.mockReturnValue(chain as any)

    const result = await listPayments({ locationId: 'loc-1' })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('payments')
    expect(chain.select).toHaveBeenCalledWith(
      expect.stringContaining('loc_scope:bookings!inner(rooms:booking_apartments!inner(apartment:apartments!inner(location_id)))'),
    )
    expect(chain.eq).toHaveBeenCalledWith(PAYMENT_LOCATION_SCOPE_FILTER, 'loc-1')
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
