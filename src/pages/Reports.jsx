import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { formatCurrency, formatDate } from '@/lib/bookingUtils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Download } from 'lucide-react'

const TABS = ['Revenue', 'Occupancy', 'Bookings']
const COLORS = ['#1e3a5f', '#2d8a4e', '#b45309', '#7c3aed', '#dc2626']

export default function Reports() {
  const [tab, setTab] = useState('Revenue')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [revenue, setRevenue] = useState({ total: 0, byApartment: [], byLocation: [], daily: [] })
  const [occupancy, setOccupancy] = useState({ current: 0, total: 0, byLocation: [] })
  const [bookingSummary, setBookingSummary] = useState({ active: 0, upcoming: 0, checkouts: 0, cancelled: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchAll() }, [dateFrom, dateTo])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchRevenue(), fetchOccupancy(), fetchBookings()])
    setLoading(false)
  }

  async function fetchRevenue() {
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, payment_date, booking:bookings(apartment:apartments(apartment_number, location:locations(name)))')
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo)

    const total = (payments || []).reduce((s, p) => s + Number(p.amount), 0)

    const byApt = {}
    const byLoc = {}
    const byDay = {}
    for (const p of payments || []) {
      const apt = p.booking?.apartment?.apartment_number || 'Unknown'
      const loc = p.booking?.apartment?.location?.name || 'Unknown'
      byApt[apt] = (byApt[apt] || 0) + Number(p.amount)
      byLoc[loc] = (byLoc[loc] || 0) + Number(p.amount)
      byDay[p.payment_date] = (byDay[p.payment_date] || 0) + Number(p.amount)
    }

    setRevenue({
      total,
      byApartment: Object.entries(byApt).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10),
      byLocation: Object.entries(byLoc).map(([name, value]) => ({ name, value })),
      daily: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date: date.slice(5), amount })),
    })
  }

  async function fetchOccupancy() {
    const { data: apts } = await supabase.from('apartments').select('status, location:locations(name)')
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

  async function fetchBookings() {
    const today = new Date().toISOString().split('T')[0]
    const [activeRes, upcomingRes, checkoutRes, cancelRes] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', 'checked_in'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', 'confirmed').gte('check_in_date', today),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', 'checked_in').lte('check_out_date', today),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_status', 'cancelled'),
    ])
    setBookingSummary({ active: activeRes.count || 0, upcoming: upcomingRes.count || 0, checkouts: checkoutRes.count || 0, cancelled: cancelRes.count || 0 })
  }

  function exportCSV() {
    const rows = [['Date', 'Amount']]
    revenue.daily.forEach(d => rows.push([d.date, d.amount]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'revenue-report.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download size={14} /> CSV</Button>
      </div>

      {/* Date range */}
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

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-sm text-gray-400 py-4">Loading…</div>}

      {/* Revenue Tab */}
      {tab === 'Revenue' && !loading && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(revenue.total)}</p>
            </CardContent>
          </Card>

          {revenue.daily.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Daily Revenue</CardTitle></CardHeader>
              <CardContent className="p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenue.daily}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Bar dataKey="amount" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {revenue.byLocation.length > 0 && (
            <Card>
              <CardHeader><CardTitle>By Location</CardTitle></CardHeader>
              <CardContent className="p-3">
                <ResponsiveContainer width="100%" height={200}>
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

          {revenue.byApartment.length > 0 && (
            <Card>
              <CardHeader><CardTitle>By Apartment (Top 10)</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2">
                {revenue.byApartment.map((a, i) => (
                  <div key={a.name} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700">{i + 1}. {a.name}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(a.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Occupancy Tab */}
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
                  <div className="h-full bg-[#1e3a5f] rounded-full" style={{ width: `${loc.rate}%` }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bookings Tab */}
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
    </div>
  )
}
