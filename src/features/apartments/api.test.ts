import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import { listAvailableApartmentsForDates } from './api'

vi.mock('@/shared/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
const mockFrom = vi.mocked(supabase.from)

afterEach(() => {
  vi.restoreAllMocks()
  mockFrom.mockReset()
})

// Fakes the two-step lookup: apartments at the location (excluding
// maintenance), then which of those have an overlapping active room.
function mockAvailability(candidates: { id: string; apartment_number: string }[], overlapping: { apartment_id: string }[] = []) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'apartments') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        order: () => Promise.resolve({ data: candidates, error: null }),
      }
      return chain as unknown as ReturnType<typeof supabase.from>
    }
    if (table === 'booking_apartments') {
      const chain = {
        select: () => chain,
        in: () => chain,
        neq: () => chain,
        lt: () => chain,
        gt: () => Promise.resolve({ data: overlapping, error: null }),
      }
      return chain as unknown as ReturnType<typeof supabase.from>
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('listAvailableApartmentsForDates', () => {
  it('excludes apartments with an overlapping active room booking', async () => {
    mockAvailability(
      [{ id: 'apt-1', apartment_number: 'A01' }, { id: 'apt-2', apartment_number: 'A02' }],
      [{ apartment_id: 'apt-1' }],
    )
    const result = await listAvailableApartmentsForDates('loc-1', '2026-07-13', '2026-07-15')
    expect(result).toEqual([{ id: 'apt-2', apartment_number: 'A02' }])
  })

  it('returns all candidates when nothing overlaps', async () => {
    mockAvailability([{ id: 'apt-1', apartment_number: 'A01' }], [])
    const result = await listAvailableApartmentsForDates('loc-1', '2026-07-13', '2026-07-15')
    expect(result).toEqual([{ id: 'apt-1', apartment_number: 'A01' }])
  })

  it('short-circuits the overlap query when the location has no candidate apartments', async () => {
    mockAvailability([], [])
    const result = await listAvailableApartmentsForDates('loc-1', '2026-07-13', '2026-07-15')
    expect(result).toEqual([])
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).not.toHaveBeenCalledWith('booking_apartments')
  })
})
