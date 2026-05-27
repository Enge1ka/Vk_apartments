import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { formatCurrency, formatDate } from '@/lib/bookingUtils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { Download, TrendingUp, AlertCircle, CreditCard, Building2 } from 'lucide-react'

const COLORS = ['#1e3a5f', '#2d8a4e', '#b45309', '#7c3aed', '#dc2626']
const METHOD_COLORS = { cash: '#1e3a5f', mobile_money: '#2d8a4e', bank_transfer: '#b45309', card: '#7c3aed' }
const METHOD_LABELS = { cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank Transfer', card: 'Card' }

const TABS = ['Revenue', 'Occupancy', 'Bookings', 'Outstanding']

function getPresetDates(preset) {
  const today = new Date()
  const fmt = d => d.toISOString().split('T')[0]
  if (preset === 'today') return { from: fmt(today), to: fmt(today) }
  if (preset === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay())
    return { from: fmt(start), to: fmt(today) }
  }
  if (preset === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: fmt(start), to: fmt(today) }
  }
  if (preset === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: fmt(start), to: fmt(end) }
  }
  return null
}

export default function Reports() {
  const { isRestricted, locationId } = useAuth()
  const [tab, setTab] = useState('Revenue')
  const [preset, setPreset] = useState('month')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  const [revenue, setRevenue] = useState({ total: 0, byMethod: [], byLocation: [], byApartment: [], daily: [] })
  const [outstanding, setOutstanding] = useState({ total: 0, bookings: [] })
  const [occupancy, setOccupancy] = useState({ current: 0, total: 0, byLocation: [] })
  const [bookingSummary, setBookingSummary] = useState({ active: 0, upcoming: 0, checkouts: 0, cancelled: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (preset !== 'custom') {
      const dates = getPresetDates(preset)
      if (dates) { setDateFrom(dates.from); setDateTo(dates.to) }
    }
  }, [preset])

  useEffect(() => { fetchAll() }, [dateFrom, dateTo, isRestricted, locationId])

  async function getAptIds() {
    if (!isRestricted || !locationId) return null
    const { data } = await supabase.from('apartments').select('id').eq('location_id', locationId)
    return (data || []).map(a => a.id)
  }

  async function fetchAll() {
    setLoading(true)
    const aptIds = await getAptIds()
    await Promise.all([
      fetchRevenue(aptIds),
      fetchOutstanding(aptIds),
      fetchOccupancy(),
      fetchBookings(aptIds),
    ])
    setLoading(false)
  }

  async function fetchRevenue(aptIds) {
    let bkIds = null
    if (aptIds) {
      const { data: bks } = await supabase.from('bookings').select('id').in('apartment_id', aptIds)
      bkIds = (bks || []).map(b => b.id)
      if (bkIds.length === 0) {
        setRevenue({ total: 0, byMethod: [], byLocation: [], byApartment: [], daily: [] })
        return
      }
    }

    let q = supabase
      .from('payments')
      .select('amount, payment_date, payment_method, booking:bookings(apartment:apartments(apartment_number, location:locations(name)))')
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo)
    if (bkIds) q = q.in('booking_id', bkIds)

    const { data: payments } = await q
    const list = payments || []

    const total = list.reduce((s, p) => s + Number(p.amount), 0)
    const byMethod = {}
    const byLoc = {}
    const byApt = {}
    const byDay = {}

    for (const p of list) {
      const method = p.payment_method || 'unknown'
      const loc = p.booking?.apartment?.location?.name || 'Unknown'
      const apt = p.booking?.apartment?.apartment_number || 'Unknown'
      byMethod[method] = (byMethod[method] || 0) + Number(p.amount)
      byLoc[loc] = (byLoc[loc] || 0) + Number(p.amount)
      byApt[apt] = (byApt[apt] || 0) + Number(p.amount)
      byDay[p.payment_date] = (byDay[p.payment_date] || 0) + Number(p.amount)
    }

    setRevenue({
      total,
      byMethod: Object.entries(byMethod).map(([name, value]) => ({ name: METHOD_LABELS[name] || name, value, key: name })),
      byLocation: Object.entries(byLoc).map(([name, value]) => ({ name, value })),
      byApartment: Object.entries(byApt).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10),
      daily: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date: date.slice(5), amount })),
    })
  }

  async function fetchOutstanding(aptIds) {
    let q = supabase
      .from('bookings')
      .select('id, booking_reference, outstanding_balance, total_amount, amount_paid, check_in_date, check_out_date, payment_status, client:clients(full_name, phone), apartment:apartments(apartment_number, location:locations(name))')
      .gt('outstanding_balance', 0)
      .neq('booking_status', 'cancelled')
      .order('outstanding_balance', { ascending: false })
    if (aptIds) q = q.in('apartment_id', aptIds)

    const { data } = await q
    const list = data || []
    setOutstanding({
      total: list.reduce((s, b) => s + Number(b.outstanding_balance || 0), 0),
      bookings: list,
    })
  }

  async function fetchOccupancy() {
    let q = supabase.from('apartments').select('status, location:locations(name)')
    if (isRestricted && locationId) q = q.eq('location_id', locationId)
    const { data: apts } = await q
    const total = (apts || []).length
    const occupied = (apts || []).filter(a => a.status === 'occupied').length

    const byLoc = {}
    const totalByLoc = {}
    for (const a of apts || []) {
      const loc = a.location?.name || 'Unknown'
      totalByLoc[loc] = (totalByLoc[loc] || 0) + 1
      if (a.status === 'occupied') byLoc[loc] = (byLoc[loc] || 0) + 1
    }

    setOccupancy({
      current: occupied,
      total,
      byLocation: Object.entries(totalByLoc).map(([name, total]) => ({
        name, total, occupied: byLoc[name] || 0,
        rate: Math.round(((byLoc[name] || 0) / total) * 100),
      })),
    })
  }

  async function fetchBookings(aptIds) {
    const today = new Date().toISOString().split('T')[0]
    const base = (status, extra = {}) => {
      let q = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', status)
      if (aptIds) q = q.in('apartment_id', aptIds)
      Object.entries(extra).forEach(([k, v]) => { q = q[k](...v) })
      return q
    }
    const [activeRes, upcomingRes, checkoutRes, cancelRes] = await Promise.all([
      base('checked_in'),
      (() => { let q = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', 'confirmed').gte('check_in_date', today); if (aptIds) q = q.in('apartment_id', aptIds); return q })(),
      (() => { let q = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', 'checked_in').lte('check_out_date', today); if (aptIds) q = q.in('apartment_id', aptIds); return q })(),
      base('cancelled'),
    ])
    setBookingSummary({ active: activeRes.count || 0, upcoming: upcomingRes.count || 0, checkouts: checkoutRes.count || 0, cancelled: cancelRes.count || 0 })
  }

  function exportCSV() {
    const rows = [['Date', 'Amount (ZMW)']]
    revenue.daily.forEach(d => rows.push([d.date, d.amount]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `revenue-${dateFrom}-${dateTo}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download size={14} /> CSV</Button>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${preset === p.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 text-sm" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 text-sm" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-sm text-gray-400 py-4">Loading…</div>}

      {/* ── REVENUE TAB ── */}
      {tab === 'Revenue' && !loading && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Collected</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(revenue.total)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{dateFrom} → {dateTo}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-green-50"><TrendingUp size={18} className="text-green-600" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
                    <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(outstanding.total)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{outstanding.bookings.length} booking{outstanding.bookings.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-red-50"><AlertCircle size={18} className="text-red-500" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment methods */}
          {revenue.byMethod.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={16} /> Payment Methods</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-0">
                {revenue.byMethod.map(m => {
                  const pct = revenue.total > 0 ? Math.round((m.value / revenue.total) * 100) : 0
                  return (
                    <div key={m.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{m.name}</span>
                        <span className="font-medium text-gray-900">{formatCurrency(m.value)} <span className="text-gray-400 text-xs">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: METHOD_COLORS[m.key] || '#1e3a5f' }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Daily chart */}
          {revenue.daily.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Daily Revenue</CardTitle></CardHeader>
              <CardContent className="p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenue.daily}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={55} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Bar dataKey="amount" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* By location pie */}
          {revenue.byLocation.length > 1 && (
            <Card>
              <CardHeader><CardTitle>By Location</CardTitle></CardHeader>
              <CardContent className="p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={revenue.byLocation} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {revenue.byLocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* By apartment */}
          {revenue.byApartment.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={16} /> Top Apartments</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2">
                {revenue.byApartment.map((a, i) => (
                  <div key={a.name} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-600">{i + 1}. {a.name}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(a.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {revenue.total === 0 && !loading && (
            <div className="text-center py-10 text-gray-400 text-sm">No payments recorded in this period.</div>
          )}
        </div>
      )}

      {/* ── OCCUPANCY TAB ── */}
      {tab === 'Occupancy' && !loading && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Current Occupancy</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {occupancy.current}/{occupancy.total}
                <span className="text-lg font-normal text-gray-400 ml-2">
                  ({occupancy.total > 0 ? Math.round((occupancy.current / occupancy.total) * 100) : 0}%)
                </span>
              </p>
            </CardContent>
          </Card>
          {occupancy.byLocation.map(loc => (
            <Card key={loc.name}>
              <CardContent className="p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium text-gray-800">{loc.name}</span>
                  <span className="text-sm text-gray-500">{loc.occupied}/{loc.total} ({loc.rate}%)</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1e3a5f] rounded-full transition-all" style={{ width: `${loc.rate}%` }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── BOOKINGS TAB ── */}
      {tab === 'Bookings' && !loading && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Currently In', value: bookingSummary.active, color: 'text-purple-600' },
            { label: 'Upcoming', value: bookingSummary.upcoming, color: 'text-blue-600' },
            { label: 'Due Checkout', value: bookingSummary.checkouts, color: 'text-orange-600' },
            { label: 'Cancelled', value: bookingSummary.cancelled, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── OUTSTANDING TAB ── */}
      {tab === 'Outstanding' && !loading && (
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Outstanding</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(outstanding.total)}</p>
              </div>
              <AlertCircle size={28} className="text-red-300" />
            </CardContent>
          </Card>

          {outstanding.bookings.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">All bookings are fully paid.</div>
          ) : (
            outstanding.bookings.map(b => (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{b.client?.full_name}</p>
                      <p className="text-xs font-mono text-gray-400">{b.booking_reference}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{b.apartment?.apartment_number} · {b.apartment?.location?.name}</p>
                      <p className="text-xs text-gray-400">{formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{formatCurrency(b.outstanding_balance)}</p>
                      <p className="text-xs text-gray-400">of {formatCurrency(b.total_amount)}</p>
                      <p className="text-xs text-gray-500 mt-1">{b.client?.phone}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
