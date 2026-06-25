import { PAYMENT_METHOD_OPTIONS, APARTMENT_STATUS } from '@/shared/constants/status'

const METHOD_LABELS = Object.fromEntries(PAYMENT_METHOD_OPTIONS.map(o => [o.value, o.label]))

// Pure aggregation functions, kept out of the page component so the
// report's actual business logic (what counts as revenue-by-location,
// occupancy rate, etc.) is unit-testable without rendering anything.

export function summarizeRevenue(payments) {
  const total = payments.reduce((s, p) => s + Number(p.amount), 0)
  const byMethod = {}
  const byLoc = {}
  const byApt = {}
  const byDay = {}

  for (const p of payments) {
    const method = p.payment_method || 'unknown'
    const loc = p.booking?.apartment?.location?.name || 'Unknown'
    const apt = p.booking?.apartment?.apartment_number || 'Unknown'
    byMethod[method] = (byMethod[method] || 0) + Number(p.amount)
    byLoc[loc] = (byLoc[loc] || 0) + Number(p.amount)
    byApt[apt] = (byApt[apt] || 0) + Number(p.amount)
    byDay[p.payment_date] = (byDay[p.payment_date] || 0) + Number(p.amount)
  }

  return {
    total,
    byMethod: Object.entries(byMethod).map(([name, value]) => ({ name: METHOD_LABELS[name] || name, value, key: name })),
    byLocation: Object.entries(byLoc).map(([name, value]) => ({ name, value })),
    byApartment: Object.entries(byApt).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10),
    daily: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date: date.slice(5), amount })),
  }
}

export function summarizeOutstanding(bookings) {
  return {
    total: bookings.reduce((s, b) => s + Number(b.outstanding_balance || 0), 0),
    bookings,
  }
}

export function summarizeOccupancy(apartments) {
  const total = apartments.length
  const occupied = apartments.filter(a => a.status === APARTMENT_STATUS.OCCUPIED).length

  const byLoc = {}
  const totalByLoc = {}
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

export function getPresetDates(preset, now = new Date()) {
  const fmt = d => d.toISOString().split('T')[0]
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
