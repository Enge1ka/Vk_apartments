import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { formatCurrency, formatDate } from '@/shared/lib/bookingUtils'
import { BOOKING_STATUS } from '@/shared/constants/status'
import { roomNumbers, roomLocationName } from '@/features/bookings/roomDisplay'
import { updateRoomStatus } from '@/features/bookings/api'
import {
  Building2, BedDouble, CheckCircle, AlertCircle,
  TrendingUp, Clock, LogOut, Plus, Home, AlertTriangle, type LucideIcon,
} from 'lucide-react'
import { useDashboardData } from '../useDashboardData'
import toast from 'react-hot-toast'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  color?: 'blue' | 'green' | 'red' | 'yellow'
}

function StatCard({ label, value, sub, icon: Icon, color = 'blue' }: StatCardProps) {
  const colors: Record<string, string> = {
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

export default function DashboardPage() {
  const { user, profile, signOut, isRestricted, locationId } = useAuth()
  const { stats, locationStats, inHouse, overdue, upcomingCheckIns, upcomingCheckOuts, recentPayments, loading, error, refetch } = useDashboardData({ isRestricted, locationId })
  const [checkingOut, setCheckingOut] = useState<Set<string>>(new Set())
  const [bulkCheckingOut, setBulkCheckingOut] = useState(false)

  async function handleCheckOut(roomId: string) {
    setCheckingOut(prev => new Set(prev).add(roomId))
    try {
      await updateRoomStatus(roomId, BOOKING_STATUS.CHECKED_OUT)
      toast.success('Checked out')
      refetch()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to check out')
    } finally {
      setCheckingOut(prev => { const s = new Set(prev); s.delete(roomId); return s })
    }
  }

  async function handleCheckOutAll() {
    if (!overdue.length) return
    setBulkCheckingOut(true)
    let ok = 0, fail = 0
    for (const r of overdue) {
      try {
        await updateRoomStatus(r.id, BOOKING_STATUS.CHECKED_OUT)
        ok++
      } catch {
        fail++
      }
    }
    setBulkCheckingOut(false)
    if (ok) toast.success(`Checked out ${ok} room${ok > 1 ? 's' : ''}`)
    if (fail) toast.error(`${fail} failed — open those bookings to resolve manually`)
    refetch()
  }

  const occupancyPct = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Welcome, {profile?.full_name || user?.email}</p>
        </div>
        <button onClick={signOut} aria-label="Sign out" className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <LogOut size={20} />
        </button>
      </div>

      <Link to="/bookings/new">
        <Button className="w-full" size="lg">
          <Plus size={18} /> New Booking
        </Button>
      </Link>

      {error && <ErrorBanner error={error} />}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Apts" value={stats.total} icon={Building2} color="blue" />
        <StatCard label="Occupied" value={stats.occupied} sub={`${occupancyPct}% occupancy`} icon={BedDouble} color="red" />
        <StatCard label="Available" value={stats.available} icon={CheckCircle} color="green" />
        <StatCard label="Today Revenue" value={formatCurrency(stats.todayRevenue)} icon={TrendingUp} color="yellow" />
      </div>

      {overdue.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle size={16} className="text-red-600" /> Overdue ({overdue.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckOutAll}
                disabled={bulkCheckingOut}
              >
                {bulkCheckingOut ? 'Checking out…' : 'Check Out All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <p className="text-xs text-gray-500 -mt-1 mb-1">Past check-out but not checked out or cancelled.</p>
            {overdue.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <Link to={`/bookings/${r.booking_id}`} className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{r.client?.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{r.apartment?.apartment_number} · {r.apartment?.location?.name}</p>
                  <p className="text-xs text-red-600 mt-0.5">Due out {formatDate(r.check_out_date)}</p>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 shrink-0 text-xs"
                  onClick={() => handleCheckOut(r.id)}
                  disabled={checkingOut.has(r.id) || bulkCheckingOut}
                >
                  {checkingOut.has(r.id) ? 'Checking out…' : 'Check Out'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {locationStats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Occupancy by Location</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {locationStats.map(loc => {
              const pct = loc.total > 0 ? Math.round((loc.occupied / loc.total) * 100) : 0
              return (
                <div key={loc.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{loc.name}</span>
                    <span className="text-gray-500">{loc.occupied}/{loc.total} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#1e3a5f] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {inHouse.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home size={16} className="text-green-600" /> Currently In-house
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {inHouse.map(b => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.client?.full_name}</p>
                  <p className="text-xs text-gray-400">{roomNumbers(b.rooms)} · {roomLocationName(b.rooms)}</p>
                </div>
                <div className="text-right">
                  {b.booking_status === BOOKING_STATUS.CONFIRMED
                    ? <Badge variant="warning">Not checked in</Badge>
                    : <span className="text-xs text-gray-500">Out {formatDate(b.check_out_date)}</span>}
                  {b.outstanding_balance > 0 && (
                    <p className="text-xs text-red-500 font-medium mt-0.5">{formatCurrency(b.outstanding_balance)} owed</p>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

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
                  <p className="text-xs text-gray-400">{roomNumbers(b.rooms)} · {roomLocationName(b.rooms)}</p>
                </div>
                <span className="text-xs text-gray-500">{formatDate(b.check_in_date)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

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
                  <p className="text-xs text-gray-400">{roomNumbers(b.rooms)} · {roomLocationName(b.rooms)}</p>
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

      {recentPayments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent Payments</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {recentPayments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.receipt_number}</p>
                  <p className="text-xs text-gray-400">{p.booking?.booking_reference} · {roomNumbers(p.booking?.rooms)}</p>
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
