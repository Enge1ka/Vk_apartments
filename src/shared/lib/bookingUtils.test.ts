import { describe, expect, it } from 'vitest'
import {
  calcDays,
  calcTotal,
  formatCurrency,
  formatDate,
  generateBookingRef,
  generateReceiptNumber,
  getPaymentStatus,
} from './bookingUtils'

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
