import { differenceInDays, format, parseISO } from 'date-fns'
import { PAYMENT_STATUS, type PaymentStatus } from '@/shared/constants/status'

export function calcDays(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0
  // parseISO (not `new Date()`) to match formatDate's parsing — `new Date('2026-01-10')`
  // reads as UTC midnight, which can shift a day off in timezones behind UTC.
  return Math.max(0, differenceInDays(parseISO(checkOut), parseISO(checkIn)))
}

export function calcTotal(days: number, ratePerDay: number): number {
  // Round to whole ngwee so this matches the database's numeric(10,2)
  // line_total exactly. Without it, float drift (e.g. 15 × 1799.99 =
  // 26999.849999999999) leaves the total a hair under the amount shown on
  // screen, so typing the displayed total fails the "amount ≤ total" check.
  return Math.round(days * ratePerDay * 100) / 100
}

export type RateMode = 'daily' | 'weekly' | 'monthly'

// A stay must reach these lengths before the weekly / monthly rate is offered
// as a discount option on the booking screen.
export const WEEKLY_MIN_NIGHTS = 7
export const MONTHLY_MIN_NIGHTS = 28

// Just the rate fields we need off an apartment — kept local so this stays a
// pure pricing helper independent of the apartments feature's Apartment type.
export interface PeriodRates {
  daily_rate: number
  weekly_rate?: number | null
  monthly_rate?: number | null
}

// Whole-kwacha policy: every rate the app produces is rounded to whole kwacha —
// ngwee only ever caused float drift and unpayable totals (K26,999.85), and VK
// prices in whole kwacha anyway. Historical decimal amounts already in the
// database still display faithfully via formatCurrency.
export function roundKwacha(amount: number): number {
  return Math.round(amount)
}

// The per-night price a billing mode works out to. Weekly and monthly rates are
// flat period prices spread evenly across the period (÷7, ÷30) so any stay
// length gets a smooth discount rather than odd whole-block jumps. Rounded to
// whole kwacha (see roundKwacha), so a period that isn't an exact multiple can
// land a few kwacha off the flat figure — which the booking screen shows before
// you confirm. Falls back to the daily rate if the chosen period rate is unset.
export function perNightForMode(apt: PeriodRates, mode: RateMode): number {
  if (mode === 'weekly' && apt.weekly_rate && apt.weekly_rate > 0) {
    return roundKwacha(apt.weekly_rate / 7)
  }
  if (mode === 'monthly' && apt.monthly_rate && apt.monthly_rate > 0) {
    return roundKwacha(apt.monthly_rate / 30)
  }
  return roundKwacha(apt.daily_rate)
}

// Which billing modes make sense for a stay of `nights` nights: always daily;
// weekly once the stay is at least a week and a weekly rate is set; monthly once
// it's about a month and a monthly rate is set. Longer stays offer every tier so
// staff can pick (a month-long stay can still be quoted at the weekly rate).
export function eligibleRateModes(apt: PeriodRates, nights: number): RateMode[] {
  const modes: RateMode[] = ['daily']
  if (nights >= WEEKLY_MIN_NIGHTS && apt.weekly_rate && apt.weekly_rate > 0) modes.push('weekly')
  if (nights >= MONTHLY_MIN_NIGHTS && apt.monthly_rate && apt.monthly_rate > 0) modes.push('monthly')
  return modes
}

// Formats a Date as yyyy-MM-dd from its *local* date parts. Every calendar
// date sent to or compared against the database must go through this (or
// todayLocalISO) — `toISOString().split('T')[0]` converts to UTC first, which
// in a UTC+ timezone (Zambia is UTC+2) yields yesterday's date between
// midnight and the offset, and is a full day off for local-midnight Dates
// like month starts.
export function toLocalISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayLocalISO(): string {
  return toLocalISODate(new Date())
}

export function formatCurrency(amount?: number | null): string {
  const value = amount ?? 0
  // `amount || 0` used to also catch NaN (NaN is falsy) and silently print
  // "K0.00" for corrupt data — surface it instead of hiding it.
  if (Number.isNaN(value)) {
    console.error('[formatCurrency] received NaN amount')
    return '—'
  }
  // Whole amounts show with no decimals (K1,800 not K1,800.00); historical
  // fractional amounts keep their ngwee rather than being misrepresented.
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function generateBookingRef(sequence: number | string): string {
  const year = new Date().getFullYear()
  return `VKL-${year}-${String(sequence).padStart(4, '0')}`
}

export function generateReceiptNumber(sequence: number | string): string {
  const year = new Date().getFullYear()
  return `RCP-${year}-${String(sequence).padStart(4, '0')}`
}

export function getPaymentStatus(totalAmount: number, amountPaid?: number | null): PaymentStatus {
  if (!amountPaid || amountPaid <= 0) return PAYMENT_STATUS.UNPAID
  if (amountPaid >= totalAmount) return PAYMENT_STATUS.PAID
  return PAYMENT_STATUS.PARTIAL
}
