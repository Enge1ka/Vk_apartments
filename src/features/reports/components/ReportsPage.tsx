import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Label } from '@/shared/ui/Label'
import { formatCurrency, formatDate, toLocalISODate } from '@/shared/lib/bookingUtils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { Download, TrendingUp, AlertCircle, CreditCard } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { useReportsData } from '../useReportsData'
import { getPresetDates } from '../selectors'
import { roomNumbers, roomLocationName } from '@/features/bookings/roomDisplay'

const COLORS = ['#1e3a5f', '#2d8a4e', '#b45309', '#7c3aed', '#dc2626']
const METHOD_COLORS: Record<string, string> = { cash: '#1e3a5f', mobile_money: '#2d8a4e', bank_transfer: '#b45309', card: '#7c3aed' }

const TABS = ['Revenue', 'Occupancy', 'Bookings', 'Outstanding']
const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
]

function defaultCustomRange() {
  const start = new Date(); start.setDate(1)
  const today = new Date()
  return { from: toLocalISODate(start), to: toLocalISODate(today) }
}

export default function ReportsPage() {
  const { isRestricted, locationId } = useAuth()
  const [tab, setTab] = useState('Revenue')
  const [preset, setPreset] = useState('month')
  const [customRange, setCustomRange] = useState(defaultCustomRange)

  // Dates are derived from the preset instead of synced into state via an
  // effect — "custom" is the only case with state of its own to edit.
  const presetDates = preset !== 'custom' ? getPresetDates(preset) : null
  const dateFrom = presetDates?.from ?? customRange.from
  const dateTo = presetDates?.to ?? customRange.to

  const { revenue, outstanding, occupancy, bookingSummary, loading, error } = useReportsData({ isRestricted, locationId, dateFrom, dateTo })

  // Each tab exports its own data — keep this in sync with what's on screen,
  // rather than always exporting Revenue regardless of the active tab.
  function csvForActiveTab(): { rows: (string | number)[][]; filename: string } {
    switch (tab) {
      case 'Occupancy':
        return {
          rows: [['Location', 'Occupied', 'Total', 'Rate (%)'], ...occupancy.byLocation.map(l => [l.name, l.occupied, l.total, l.rate])],
          filename: `occupancy-${dateFrom}-${dateTo}.csv`,
        }
      case 'Bookings':
        return {
          rows: [
            ['Status', 'Count'],
            ['Currently In', bookingSummary.active],
            ['Upcoming', bookingSummary.upcoming],
            ['Due Checkout', bookingSummary.checkouts],
            ['Cancelled', bookingSummary.cancelled],
          ],
          filename: `bookings-${dateFrom}-${dateTo}.csv`,
        }
      case 'Outstanding':
        return {
          rows: [
            ['Reference', 'Client', 'Rooms', 'Location', 'Check In', 'Check Out', 'Outstanding (ZMW)', 'Total (ZMW)'],
            ...outstanding.bookings.map(b => [
              b.booking_reference, b.client?.full_name ?? '', roomNumbers(b.rooms),
              roomLocationName(b.rooms), b.check_in_date ?? '', b.check_out_date ?? '', b.outstanding_balance, b.total_amount,
            ]),
          ],
          filename: `outstanding-${dateFrom}-${dateTo}.csv`,
        }
      default:
        return {
          rows: [['Date', 'Amount (ZMW)'], ...revenue.daily.map(d => [d.date, d.amount])],
          filename: `revenue-${dateFrom}-${dateTo}.csv`,
        }
    }
  }

  function exportCSV() {
    const { rows, filename } = csvForActiveTab()
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download size={14} /> CSV</Button>
      </div>

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
            <Label htmlFor="report-date-from" className="text-xs">From</Label>
            <Input id="report-date-from" type="date" value={customRange.from} onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))} className="h-10 text-sm" />
          </div>
          <div className="flex-1">
            <Label htmlFor="report-date-to" className="text-xs">To</Label>
            <Input id="report-date-to" type="date" value={customRange.to} onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))} className="h-10 text-sm" />
          </div>
        </div>
      )}

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

      {error && <ErrorBanner error={error} />}

      {loading && <div className="text-center text-sm text-gray-400 py-4">Loading…</div>}

      {tab === 'Revenue' && !loading && (
        <div className="space-y-4">
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

          {revenue.daily.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Daily Revenue</CardTitle></CardHeader>
              <CardContent className="p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenue.daily}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={55} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="amount" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {revenue.byLocation.length > 1 && (
            <Card>
              <CardHeader><CardTitle>By Location</CardTitle></CardHeader>
              <CardContent className="p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={revenue.byLocation}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {revenue.byLocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {revenue.total === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">No payments recorded in this period.</div>
          )}
        </div>
      )}

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
                      <p className="text-xs text-gray-500 mt-0.5">{roomNumbers(b.rooms)} · {roomLocationName(b.rooms)}</p>
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
