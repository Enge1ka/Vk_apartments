import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/bookingUtils'
import {
  Building2, BedDouble, CheckCircle, AlertCircle,
  TrendingUp, Clock, LogOut, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

function StatCard({ label, value, sub, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${colors[color]}`}>
            <Icon size={20} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const [stats, setStats] = useState({
    total: 0, occupied: 0, available: 0, maintenance: 0, todayRevenue: 0
  })
  const [recentPayments, setRecentPayments] = useState([])
  const [upcomingCheckIns, setUpcomingCheckIns] = useState([])
  const [upcomingCheckOuts, setUpcomingCheckOuts] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

    const [aptRes, payRes, checkInRes, checkOutRes, locRes] = await Promise.all([
      supabase.from('apartments').select('status, location_id'),
      supabase.from('payments').select('amount').gte('payment_date', today).lte('payment_date', today),
      supabase.from('bookings')
        .select('*, client:clients(full_name), apartment:apartments(apartment_number, location:locations(name))')
        .gte('check_in_date', today).lte('check_in_date', in3Days)
        .neq('booking_status', 'cancelled').order('check_in_date').limit(5),
      supabase.from('bookings')
        .select('*, client:clients(full_name), apartment:apartments(apartment_number, location:locations(name))')
        .gte('check_out_date', today).lte('check_out_date', in3Days)
        .neq('booking_status', 'cancelled').order('check_out_date').limit(5),
      supabase.from('locations').select('id, name, city'),
    ])

    const apts = aptRes.data || []
    const todayRevenue = (payRes.data || []).reduce((sum, p) => sum + Number(p.amount), 0)

    setStats({
      total: apts.length,
      occupied: apts.filter(a => a.status === 'occupied').length,
      available: apts.filter(a => a.status === 'available').length,
      maintenance: apts.filter(a => a.status === 'maintenance').length,
      todayRevenue,
    })

    setUpcomingCheckIns(checkInRes.data || [])
    setUpcomingCheckOuts(checkOutRes.data || [])

    const locs = locRes.data || []
    const locationStats = locs.map(loc => ({
      ...loc,
      total: apts.filter(a => a.location_id === loc.id).length,
      occupied: apts.filter(a => a.location_id === loc.id && a.status === 'occupied').length,
    }))
    setLocations(locationStats)

    // Recent payments
    const { data: payments } = await supabase
      .from('payments')
      .select('*, booking:bookings(booking_reference, apartment:apartments(apartment_number))')
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentPayments(payments || [])

    setLoading(false)
  }

  const occupancyPct = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Welcome, {profile?.full_name || user?.email}</p>
        </div>
        <button onClick={signOut} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <LogOut size={20} />
        </button>
      </div>

      {/* Quick action */}
      <Link to="/bookings/new">
        <Button className="w-full" size="lg">
          <Plus size={18} /> New Booking
        </Button>
      </Link>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Apts" value={stats.total} icon={Building2} color="blue" />
        <StatCard label="Occupied" value={stats.occupied} sub={`${occupancyPct}% occupancy`} icon={BedDouble} color="red" />
        <StatCard label="Available" value={stats.available} icon={CheckCircle} color="green" />
        <StatCard label="Today Revenue" value={formatCurrency(stats.todayRevenue)} icon={TrendingUp} color="yellow" />
      </div>

      {/* Occupancy per location */}
      {locations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Occupancy by Location</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {locations.map(loc => {
              const pct = loc.total > 0 ? Math.round((loc.occupied / loc.total) * 100) : 0
              return (
                <div key={loc.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{loc.name}</span>
                    <span className="text-gray-500">{loc.occupied}/{loc.total} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1e3a5f] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Upcoming check-ins */}
      {upcomingCheckIns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={16} className="text-blue-500" /> Upcoming Check-ins
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {upcomingCheckIns.map(b => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.client?.full_name}</p>
                  <p className="text-xs text-gray-400">{b.apartment?.apartment_number} · {b.apartment?.location?.name}</p>
                </div>
                <span className="text-xs text-gray-500">{formatDate(b.check_in_date)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming check-outs */}
      {upcomingCheckOuts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle size={16} className="text-orange-500" /> Upcoming Check-outs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {upcomingCheckOuts.map(b => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.client?.full_name}</p>
                  <p className="text-xs text-gray-400">{b.apartment?.apartment_number} · {b.apartment?.location?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{formatDate(b.check_out_date)}</p>
                  {b.outstanding_balance > 0 && (
                    <p className="text-xs text-red-500 font-medium">{formatCurrency(b.outstanding_balance)} owed</p>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent payments */}
      {recentPayments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent Payments</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {recentPayments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.receipt_number}</p>
                  <p className="text-xs text-gray-400">{p.booking?.booking_reference} · {p.booking?.apartment?.apartment_number}</p>
                </div>
                <span className="text-sm font-semibold text-green-600">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="text-center text-sm text-gray-400 py-4">Loading…</div>
      )}
    </div>
  )
}
