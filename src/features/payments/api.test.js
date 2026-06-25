import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import * as apartmentsApi from '@/features/apartments/api'
import * as bookingsApi from '@/features/bookings/api'
import { listPayments, recordPayment } from './api'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

afterEach(() => {
  vi.restoreAllMocks()
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('listPayments', () => {
  it('lists all payments when no location filter is given', async () => {
    const chain = { select: () => chain, order: () => Promise.resolve({ data: [{ id: 'p1' }], error: null }) }
    supabase.from.mockReturnValue(chain)

    await expect(listPayments()).resolves.toEqual([{ id: 'p1' }])
  })

  it('scopes to bookings for the location, short-circuiting when there are none', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue([])
    await expect(listPayments({ locationId: 'loc-1' })).resolves.toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('filters by resolved booking ids when the location has apartments and bookings', async () => {
    vi.spyOn(apartmentsApi, 'listApartmentIds').mockResolvedValue(['apt-1'])
    vi.spyOn(bookingsApi, 'listBookingIdsForApartments').mockResolvedValue(['booking-1'])
    const chain = { select: () => chain, order: () => chain, in: vi.fn(() => Promise.resolve({ data: [{ id: 'p1' }], error: null })) }
    supabase.from.mockReturnValue(chain)

    const result = await listPayments({ locationId: 'loc-1' })
    expect(chain.in).toHaveBeenCalledWith('booking_id', ['booking-1'])
    expect(result).toEqual([{ id: 'p1' }])
  })
})

describe('recordPayment', () => {
  it('calls the record_payment RPC and returns its result', async () => {
    supabase.rpc.mockResolvedValue({ data: { receipt_number: 'RCP-2026-0001' }, error: null })

    const result = await recordPayment({ bookingId: 'booking-1', amount: 100, paymentMethod: 'cash' })

    expect(supabase.rpc).toHaveBeenCalledWith('record_payment', expect.objectContaining({
      p_booking_id: 'booking-1', p_amount: 100, p_payment_method: 'cash',
    }))
    expect(result).toEqual({ receipt_number: 'RCP-2026-0001' })
  })

  it('throws when the RPC returns an error', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'exceeds balance' } })
    await expect(recordPayment({ bookingId: 'booking-1', amount: 9999, paymentMethod: 'cash' }))
      .rejects.toMatchObject({ message: 'exceeds balance' })
  })
})
