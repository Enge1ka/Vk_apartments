import { describe, expect, it } from 'vitest'
import { getPresetDates, summarizeOccupancy, summarizeOutstanding, summarizeRevenue } from './selectors'

describe('summarizeRevenue', () => {
  const payments = [
    { amount: '100', payment_method: 'cash', payment_date: '2026-01-05', booking: { apartment: { apartment_number: 'A01', location: { name: 'Nkana East' } } } },
    { amount: '50', payment_method: 'mobile_money', payment_date: '2026-01-05', booking: { apartment: { apartment_number: 'A02', location: { name: 'Ndola' } } } },
    { amount: '25', payment_method: 'cash', payment_date: '2026-01-06', booking: { apartment: { apartment_number: 'A01', location: { name: 'Nkana East' } } } },
  ]

  it('sums the total and groups by method, location, apartment, and day', () => {
    const result = summarizeRevenue(payments)
    expect(result.total).toBe(175)
    expect(result.byMethod).toEqual(expect.arrayContaining([
      { name: 'Cash', value: 125, key: 'cash' },
      { name: 'Mobile Money', value: 50, key: 'mobile_money' },
    ]))
    expect(result.byLocation).toEqual(expect.arrayContaining([
      { name: 'Nkana East', value: 125 },
      { name: 'Ndola', value: 50 },
    ]))
    expect(result.byApartment[0]).toEqual({ name: 'A01', amount: 125 })
    expect(result.daily).toEqual([{ date: '01-05', amount: 150 }, { date: '01-06', amount: 25 }])
  })

  it('handles an empty payment list', () => {
    expect(summarizeRevenue([])).toEqual({ total: 0, byMethod: [], byLocation: [], byApartment: [], daily: [] })
  })
})

describe('summarizeOutstanding', () => {
  it('sums outstanding balances and passes the bookings through', () => {
    const bookings = [{ outstanding_balance: '100' }, { outstanding_balance: '50' }]
    expect(summarizeOutstanding(bookings)).toEqual({ total: 150, bookings })
  })
})

describe('summarizeOccupancy', () => {
  it('computes current/total and per-location occupancy rate', () => {
    const apartments = [
      { status: 'occupied', location: { name: 'Nkana East' } },
      { status: 'available', location: { name: 'Nkana East' } },
      { status: 'occupied', location: { name: 'Ndola' } },
    ]
    const result = summarizeOccupancy(apartments)
    expect(result).toEqual({
      current: 2,
      total: 3,
      byLocation: [
        { name: 'Nkana East', total: 2, occupied: 1, rate: 50 },
        { name: 'Ndola', total: 1, occupied: 1, rate: 100 },
      ],
    })
  })
})

describe('getPresetDates', () => {
  const now = new Date('2026-03-15T12:00:00Z')

  it('returns today for both from and to', () => {
    expect(getPresetDates('today', now)).toEqual({ from: '2026-03-15', to: '2026-03-15' })
  })

  it('returns the first of the month through today for "month"', () => {
    expect(getPresetDates('month', now)).toEqual({ from: '2026-03-01', to: '2026-03-15' })
  })

  it('returns the full prior month for "last_month"', () => {
    expect(getPresetDates('last_month', now)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('returns null for an unknown preset (custom)', () => {
    expect(getPresetDates('custom', now)).toBeNull()
  })
})
