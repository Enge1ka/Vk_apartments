import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { ChevronLeft, Phone, CreditCard } from 'lucide-react'
import { formatCurrency, formatDate } from '@/shared/lib/bookingUtils'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { BOOKING_STATUS_BADGE, PAYMENT_STATUS_BADGE, getBadge } from '@/shared/constants/status'
import { getClient } from '../api'

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, loading, error } = useSupabaseQuery(() => getClient(id!), [id], 'clients.getClient')

  if (loading) return <div className="p-4 text-center text-gray-400 py-16">Loading…</div>
  if (error) return <div className="p-4"><ErrorBanner error={error} /></div>
  if (!client) return <div className="p-4 text-center text-gray-400 py-16">Client not found</div>

  const bookings = [...(client.bookings ?? [])].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const totalPaid = bookings.reduce((s, b) => s + Number(b.amount_paid || 0), 0)
  const totalOutstanding = bookings.reduce((s, b) => s + Number(b.outstanding_balance || 0), 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => navigate('/clients')} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{client.full_name}</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1"><Phone size={12} /> {client.phone}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-1 text-sm">
          {client.nrc_or_passport && <p className="text-gray-500">NRC / Passport: <span className="text-gray-800">{client.nrc_or_passport}</span></p>}
          {client.email && <p className="text-gray-500">Email: <span className="text-gray-800">{client.email}</span></p>}
          {client.company && <p className="text-gray-500">Company: <span className="text-gray-800">{client.company}</span></p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Bookings</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{bookings.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Paid</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Owed</p>
          <p className={`text-xl font-bold mt-1 ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(totalOutstanding)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Booking History</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {bookings.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CreditCard size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No bookings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => {
                const sb = getBadge(BOOKING_STATUS_BADGE, b.booking_status)
                const pb = getBadge(PAYMENT_STATUS_BADGE, b.payment_status)
                return (
                  <Link key={b.id} to={`/bookings/${b.id}`} className="block border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-mono text-gray-700">{b.booking_reference}</p>
                        <p className="text-xs text-gray-400">{formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                        <Badge variant={pb.variant}>{pb.label}</Badge>
                      </div>
                    </div>
                    <div className="flex justify-between mt-1 text-sm">
                      <span className="text-gray-500">{formatCurrency(b.total_amount)}</span>
                      {b.outstanding_balance > 0 && <span className="text-red-500 font-medium">{formatCurrency(b.outstanding_balance)} owed</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
