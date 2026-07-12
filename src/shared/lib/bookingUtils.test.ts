import { describe, expect, it } from 'vitest'
import {
  calcDays,
  calcTotal,
  formatCurrency,
  formatDate,
  generateBookingRef,
  generateReceiptNumber,
  getPaymentStatus,
  perNightForMode,
  eligibleRateModes,
} from './bookingUtils'

const APT = { daily_rate: 1200, weekly_rate: 7000, monthly_rate: 25000 }

describe('calcDays', () => {
  it('returns the number of nights between two dates', () => {
    expect(calcDays('2026-01-01', '2026-01-04')).toBe(3)
  })

  it('returns 0 when check-out is before or equal to check-in', () => {
    expect(calcDays('2026-01-04', '2026-01-01')).toBe(0)
    expect(calcDays('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('returns 0 when either date is missing', () => {
    expect(calcDays(null, '2026-01-04')).toBe(0)
    expect(calcDays('2026-01-01', null)).toBe(0)
  })
})

describe('calcTotal', () => {
  it('multiplies days by the daily rate', () => {
    expect(calcTotal(3, 100)).toBe(300)
  })

  it('rounds to whole ngwee so a decimal rate has no float drift', () => {
    // 15 × 1799.99 is 26999.849999999999 in raw float — must land on 26999.85
    // so paying the displayed total is accepted.
    expect(calcTotal(15, 1799.99)).toBe(26999.85)
    expect(calcTotal(30, 833.33)).toBe(24999.9)
  })
})

describe('formatCurrency', () => {
  it('formats a number as ZMW currency', () => {
    expect(formatCurrency(1500)).toContain('1,500.00')
  })

  it('treats a missing amount as zero', () => {
    expect(formatCurrency(undefined)).toContain('0.00')
  })
})

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    expect(formatDate('2026-03-05')).toBe('05 Mar 2026')
  })

  it('returns an em dash for a missing date', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('falls back to the raw string for an unparsable date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('generateBookingRef / generateReceiptNumber', () => {
  it('pads the sequence to 4 digits with the current year', () => {
    const year = new Date().getFullYear()
    expect(generateBookingRef(7)).toBe(`VKL-${year}-0007`)
    expect(generateReceiptNumber(42)).toBe(`RCP-${year}-0042`)
  })
})

describe('getPaymentStatus', () => {
  it('classifies unpaid, partial, and paid amounts', () => {
    expect(getPaymentStatus(1000, 0)).toBe('unpaid')
    expect(getPaymentStatus(1000, 500)).toBe('partial')
    expect(getPaymentStatus(1000, 1000)).toBe('paid')
    expect(getPaymentStatus(1000, 1200)).toBe('paid')
  })
})

describe('perNightForMode', () => {
  it('returns the plain daily rate for daily', () => {
    expect(perNightForMode(APT, 'daily')).toBe(1200)
  })

  it('spreads the weekly rate over 7 nights', () => {
    expect(perNightForMode(APT, 'weekly')).toBe(1000) // 7000 / 7
  })

  it('spreads the monthly rate over 30 nights, rounded to the ngwee', () => {
    expect(perNightForMode(APT, 'monthly')).toBe(833.33) // 25000 / 30 = 833.333…
  })

  it('falls back to the daily rate when the period rate is unset or zero', () => {
    expect(perNightForMode({ daily_rate: 1200, weekly_rate: null, monthly_rate: null }, 'weekly')).toBe(1200)
    expect(perNightForMode({ daily_rate: 1200, weekly_rate: 0, monthly_rate: 0 }, 'monthly')).toBe(1200)
  })
})

describe('eligibleRateModes', () => {
  it('offers only daily for a stay shorter than a week', () => {
    expect(eligibleRateModes(APT, 6)).toEqual(['daily'])
  })

  it('adds weekly once the stay reaches a week', () => {
    expect(eligibleRateModes(APT, 7)).toEqual(['daily', 'weekly'])
    expect(eligibleRateModes(APT, 20)).toEqual(['daily', 'weekly'])
  })

  it('adds monthly once the stay reaches about a month, keeping weekly too', () => {
    expect(eligibleRateModes(APT, 28)).toEqual(['daily', 'weekly', 'monthly'])
    expect(eligibleRateModes(APT, 45)).toEqual(['daily', 'weekly', 'monthly'])
  })

  it('only offers a tier the apartment has a rate for', () => {
    const noPeriods = { daily_rate: 1200, weekly_rate: null, monthly_rate: null }
    expect(eligibleRateModes(noPeriods, 40)).toEqual(['daily'])
    const weeklyOnly = { daily_rate: 1200, weekly_rate: 7000, monthly_rate: null }
    expect(eligibleRateModes(weeklyOnly, 40)).toEqual(['daily', 'weekly'])
  })
})

describe('period pricing end to end', () => {
  it('a 30-night stay on the monthly rate lands within a ngwee of the flat figure', () => {
    const total = calcTotal(30, perNightForMode(APT, 'monthly'))
    expect(Math.abs(total - 25000)).toBeLessThanOrEqual(0.1) // 30 × 833.33 = 24999.90
  })

  it('an exact-week stay on the weekly rate matches the flat weekly figure', () => {
    expect(calcTotal(7, perNightForMode(APT, 'weekly'))).toBe(7000)
  })
})
