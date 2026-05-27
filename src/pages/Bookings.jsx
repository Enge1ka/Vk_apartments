import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatCurrency, formatDate } from '@/lib/bookingUtils'
import { useAuth } from '@/hooks/useAuth'
import { Plus, Search, BedDouble } from 'lucide-react'

const statusBadge = {
  confirmed: { variant: 'info', label: 'Confirmed' },
  checked_in: { variant: 'purple', label: 'Checked In' },
  checked_out: { variant: 'default', label: 'Checked Out' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
}

const paymentBadge = {
  unpaid: { variant: 'danger', label: 'Unpaid' },
  partial: { variant: 'warning', label: 'Partial' },
  paid: { variant: 'success', label: 'Paid' },
}

export default function Bookings() {
  const { isRestricted, locationId } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPayment, setFilterPayment] = useState('')

  useEffect(() => { fetchBookings() }, [isRestricted, locationId])

  async function fetchBookings() {
    setLoading(true)

    let aptIds = null
    if (isRestricted && locationId) {
      const { data: apts } = await supabase.from('apartments').select('id').eq('location_id', locationId)
      aptIds = (apts || []).map(a => a.id)
      if (aptIds.length === 0) { setBookings([]); setLoading(false); return }
    }

    let query = supabase
      .from('bookings')
      .select(`
        id, booking_reference, check_in_date, check_out_date,
        total_amount, amount_paid, outstanding_balance,
        booking_status, payment_status,
        client:clients(full_name, phone),
        apartment:apartments(apartment_number, type, location:locations(name))
      `)
      .order('created_at', { ascending: false })

    if (aptIds) query = query.in('apartment_id', aptIds)

    const { data } = await query
    setBookings(data || [])
    setLoading(false)
  }

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      b.booking_reference?.toLowerCase().includes(q) ||
      b.client?.full_name?.toLowerCase().includes(q) ||
      b.apartment?.apartment_number?.toLowerCase().includes(q)
    const matchStatus = !filterStatus || b.booking_status === filterStatus
    const matchPayment = !filterPayment || b.payment_status === filterPayment
    return matchSearch && matchStatus && matchPayment
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
        <Link to="/bookings/new">
          <Button size="sm"><Plus size={16} /> New</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search by ref, client, apartment…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All payments</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
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
            const sb = statusBadge[b.booking_status] || { variant: 'default', label: b.booking_status }
            const pb = paymentBadge[b.payment_status] || { variant: 'default', label: b.payment_status }
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
                      <p>{b.apartment?.apartment_number} · {b.apartment?.location?.name}</p>
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
