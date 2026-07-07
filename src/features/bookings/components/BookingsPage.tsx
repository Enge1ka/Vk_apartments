import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Select } from '@/shared/ui/Select'
import { Label } from '@/shared/ui/Label'
import { formatCurrency, formatDate } from '@/shared/lib/bookingUtils'
import { useAuth } from '@/features/auth/useAuth'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { BOOKING_STATUS, BOOKING_STATUS_BADGE, PAYMENT_STATUS, PAYMENT_STATUS_BADGE, getBadge } from '@/shared/constants/status'
import { Plus, Search, BedDouble } from 'lucide-react'
import { listBookings } from '../api'
import { roomNumbers, roomLocationName, roomCountLabel } from '../roomDisplay'

export default function BookingsPage() {
  const { isRestricted, locationId } = useAuth()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPayment, setFilterPayment] = useState('')

  const { data: bookings, loading } = useSupabaseQuery(async () => {
    if (isRestricted && !locationId) return []
    return listBookings({
      status: filterStatus || undefined,
      paymentStatus: filterPayment || undefined,
      locationId: isRestricted ? (locationId ?? undefined) : undefined,
    })
  }, [isRestricted, locationId, filterStatus, filterPayment], 'bookings.listBookings')

  const filtered = (bookings ?? []).filter(b => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      b.booking_reference?.toLowerCase().includes(q) ||
      b.client?.full_name?.toLowerCase().includes(q) ||
      roomNumbers(b.rooms).toLowerCase().includes(q)
    return matchSearch
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
        <Link to="/bookings/new">
          <Button size="sm"><Plus size={16} /> New</Button>
        </Link>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Label htmlFor="booking-search" className="sr-only">Search bookings</Label>
          <Input id="booking-search" placeholder="Search by ref, client, apartment…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Label htmlFor="filter-booking-status" className="sr-only">Filter by booking status</Label>
          <Select id="filter-booking-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All statuses</option>
            <option value={BOOKING_STATUS.CONFIRMED}>Confirmed</option>
            <option value={BOOKING_STATUS.CHECKED_IN}>Checked In</option>
            <option value={BOOKING_STATUS.CHECKED_OUT}>Checked Out</option>
            <option value={BOOKING_STATUS.CANCELLED}>Cancelled</option>
          </Select>
          <Label htmlFor="filter-payment-status" className="sr-only">Filter by payment status</Label>
          <Select id="filter-payment-status" value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All payments</option>
            <option value={PAYMENT_STATUS.UNPAID}>Unpaid</option>
            <option value={PAYMENT_STATUS.PARTIAL}>Partial</option>
            <option value={PAYMENT_STATUS.PAID}>Paid</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <BedDouble size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">No bookings found</p>
          <Link to="/bookings/new"><Button>Create First Booking</Button></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => {
            const sb = getBadge(BOOKING_STATUS_BADGE, b.booking_status)
            const pb = getBadge(PAYMENT_STATUS_BADGE, b.payment_status)
            return (
              <Link key={b.id} to={`/bookings/${b.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{b.client?.full_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{b.booking_reference}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                        <Badge variant={pb.variant}>{pb.label}</Badge>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>{roomNumbers(b.rooms)} · {roomLocationName(b.rooms)}{b.rooms.length > 1 ? ` · ${roomCountLabel(b.rooms)}` : ''}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}</p>
                    </div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-gray-50">
                      <span className="text-sm text-gray-500">Total: {formatCurrency(b.total_amount)}</span>
                      {b.outstanding_balance > 0 && (
                        <span className="text-sm font-medium text-red-500">Balance: {formatCurrency(b.outstanding_balance)}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
