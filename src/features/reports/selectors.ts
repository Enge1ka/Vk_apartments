import { PAYMENT_METHOD_OPTIONS, APARTMENT_STATUS } from '@/shared/constants/status'
import { toLocalISODate } from '@/shared/lib/bookingUtils'
import type { Payment } from '@/features/payments/api'
import type { OutstandingBooking } from '@/features/bookings/api'
import type { Apartment } from '@/features/apartments/api'

const METHOD_LABELS: Record<string, string> = Object.fromEntries(PAYMENT_METHOD_OPTIONS.map(o => [o.value, o.label]))

// Pure aggregation functions, kept out of the page component so the
// report's actual business logic (what counts as revenue-by-location,
// occupancy rate, etc.) is unit-testable without rendering anything.

export interface RevenueSummary {
  total: number
  byMethod: { name: string; value: number; key: string }[]
  byLocation: { name: string; value: number }[]
  daily: { date: string; amount: number }[]
}

// Revenue is broken down by method, location, and day. There is deliberately
// no "by apartment": a payment now settles a whole booking that may span
// several rooms, so it can't be attributed to a single apartment without
// arbitrarily splitting it. Location stays exact (a booking's rooms share a
// location), so that's the room-level breakdown we keep.
export function summarizeRevenue(payments: Payment[]): RevenueSummary {
  const total = payments.reduce((s, p) => s + Number(p.amount), 0)
  const byMethod: Record<string, number> = {}
  const byLoc: Record<string, number> = {}
  const byDay: Record<string, number> = {}

  for (const p of payments) {
    const method = p.payment_method || 'unknown'
    const loc = p.booking?.rooms?.[0]?.apartment?.location?.name || 'Unknown'
    byMethod[method] = (byMethod[method] || 0) + Number(p.amount)
    byLoc[loc] = (byLoc[loc] || 0) + Number(p.amount)
    byDay[p.payment_date] = (byDay[p.payment_date] || 0) + Number(p.amount)
  }

  return {
    total,
    byMethod: Object.entries(byMethod).map(([name, value]) => ({ name: METHOD_LABELS[name] || name, value, key: name })),
    byLocation: Object.entries(byLoc).map(([name, value]) => ({ name, value })),
    daily: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date: date.slice(5), amount })),
  }
}

export interface OutstandingSummary {
  total: number
  bookings: OutstandingBooking[]
}

export function summarizeOutstanding(bookings: OutstandingBooking[]): OutstandingSummary {
  return {
    total: bookings.reduce((s, b) => s + Number(b.outstanding_balance || 0), 0),
    bookings,
  }
}

export interface OccupancySummary {
  current: number
  total: number
  byLocation: { name: string; total: number; occupied: number; rate: number }[]
}

export function summarizeOccupancy(apartments: Apartment[]): OccupancySummary {
  const total = apartments.length
  const occupied = apartments.filter(a => a.status === APARTMENT_STATUS.OCCUPIED).length

  const byLoc: Record<string, number> = {}
  const totalByLoc: Record<string, number> = {}
  for (const a of apartments) {
    const loc = a.location?.name || 'Unknown'
    totalByLoc[loc] = (totalByLoc[loc] || 0) + 1
    if (a.status === APARTMENT_STATUS.OCCUPIED) byLoc[loc] = (byLoc[loc] || 0) + 1
  }

  return {
    current: occupied,
    total,
    byLocation: Object.entries(totalByLoc).map(([name, locTotal]) => ({
      name,
      total: locTotal,
      occupied: byLoc[name] || 0,
      rate: Math.round(((byLoc[name] || 0) / locTotal) * 100),
    })),
  }
}

export interface DateRange {
  from: string
  to: string
}

export function getPresetDates(preset: string, now: Date = new Date()): DateRange | null {
  // Local-date formatting, not toISOString(): the starts built below are
  // local midnights, and UTC conversion would shift them back a day in any
  // UTC+ timezone — "last month" would run e.g. May 31 → Jun 29, dropping
  // the final day's revenue from the report.
  const fmt = toLocalISODate
  if (preset === 'today') return { from: fmt(now), to: fmt(now) }
  if (preset === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay())
    return { from: fmt(start), to: fmt(now) }
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: fmt(start), to: fmt(now) }
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: fmt(start), to: fmt(end) }
  }
  return null
}
