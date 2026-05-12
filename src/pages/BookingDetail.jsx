import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { formatCurrency, formatDate, generateReceiptNumber, getPaymentStatus } from '@/lib/bookingUtils'
import { downloadReceipt, shareReceiptWhatsApp } from '@/lib/receiptGenerator'
import { ChevronLeft, Download, Share2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const statusBadge = {
  confirmed: { variant: 'info', label: 'Confirmed' },
  checked_in: { variant: 'purple', label: 'Checked In' },
  checked_out: { variant: 'default', label: 'Checked Out' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
}

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [booking, setBooking] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [payDialog, setPayDialog] = useState(false)
  const [statusDialog, setStatusDialog] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash' })
  const [newStatus, setNewStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [bookRes, payRes] = await Promise.all([
      supabase.from('bookings').select(`
        *, client:clients(*), apartment:apartments(*, location:locations(*))
      `).eq('id', id).single(),
      supabase.from('payments').select('*').eq('booking_id', id).order('created_at'),
    ])
    setBooking(bookRes.data)
    setPayments(payRes.data || [])
    setLoading(false)
  }

  async function recordPayment() {
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)

    const { count } = await supabase.from('payments').select('*', { count: 'exact', head: true })
      .gte('created_at', `${new Date().getFullYear()}-01-01`)
    const receiptNum = generateReceiptNumber((count || 0) + 1)

    const { error } = await supabase.from('payments').insert({
      booking_id: id,
      client_id: booking.client_id,
      amount: Number(payForm.amount),
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: payForm.payment_method,
      receipt_number: receiptNum,
      recorded_by: user?.id,
    })

    if (error) { toast.error(error.message); setSaving(false); return }

    // Update booking totals
    const newPaid = (booking.amount_paid || 0) + Number(payForm.amount)
    const newStatus = getPaymentStatus(booking.total_amount, newPaid)
    await supabase.from('bookings').update({ amount_paid: newPaid, payment_status: newStatus }).eq('id', id)

    toast.success(`Payment recorded — ${receiptNum}`)
    setPayDialog(false)
    setPayForm({ amount: '', payment_method: 'cash' })
    fetchAll()
    setSaving(false)
  }

  async function updateStatus() {
    if (!newStatus) return
    if (newStatus === 'checked_out' && booking.outstanding_balance > 0) {
      const confirmed = window.confirm(`Client has outstanding balance of ${formatCurrency(booking.outstanding_balance)}. Proceed with checkout?`)
      if (!confirmed) return
    }
    setSaving(true)
    const updates = { booking_status: newStatus }
    if (newStatus === 'checked_in') updates.apartment_status = 'occupied'
    if (newStatus === 'checked_out' || newStatus === 'cancelled') {
      await supabase.from('apartments').update({ status: 'available' }).eq('id', booking.apartment_id)
    }
    if (newStatus === 'checked_in') {
      await supabase.from('apartments').update({ status: 'occupied' }).eq('id', booking.apartment_id)
    }
    await supabase.from('bookings').update({ booking_status: newStatus }).eq('id', id)
    toast.success('Status updated')
    setStatusDialog(false)
    fetchAll()
    setSaving(false)
  }

  function handleDownloadReceipt(payment) {
    downloadReceipt({
      receiptNumber: payment.receipt_number,
      paymentDate: payment.payment_date,
      clientName: booking.client?.full_name,
      clientPhone: booking.client?.phone,
      clientNRC: booking.client?.nrc_or_passport,
      apartmentNumber: booking.apartment?.apartment_number,
      location: booking.apartment?.location?.name,
      checkIn: booking.check_in_date,
      checkOut: booking.check_out_date,
      numberOfDays: booking.number_of_days,
      ratePerDay: booking.rate_per_day,
      totalAmount: booking.total_amount,
      amountPaid: payment.amount,
      outstandingBalance: booking.outstanding_balance,
      paymentMethod: payment.payment_method,
      staffName: user?.email,
      bookingRef: booking.booking_reference,
    })
  }

  if (loading) return <div className="p-4 text-center text-gray-400 py-16">Loading…</div>
  if (!booking) return <div className="p-4 text-center text-gray-400 py-16">Booking not found</div>

  const sb = statusBadge[booking.booking_status] || { variant: 'default', label: booking.booking_status }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => navigate('/bookings')} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{booking.booking_reference}</h1>
          <Badge variant={sb.variant}>{sb.label}</Badge>
        </div>
      </div>

      {/* Client */}
      <Card>
        <CardHeader><CardTitle>Client</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm pt-0">
          <p className="font-semibold text-gray-800">{booking.client?.full_name}</p>
          <p className="text-gray-500">{booking.client?.phone}</p>
          {booking.client?.nrc_or_passport && <p className="text-gray-400">NRC: {booking.client.nrc_or_passport}</p>}
          {booking.client?.company && <p className="text-gray-400">{booking.client.company}</p>}
        </CardContent>
      </Card>

      {/* Apartment */}
      <Card>
        <CardHeader><CardTitle>Apartment</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm pt-0">
          <p className="font-semibold text-gray-800">{booking.apartment?.apartment_number} — {booking.apartment?.type}</p>
          <p className="text-gray-500">{booking.apartment?.location?.name}</p>
          <p className="text-gray-400">{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)} ({booking.number_of_days} nights)</p>
        </CardContent>
      </Card>

      {/* Financials */}
      <Card>
        <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm pt-0">
          <Row label="Total Amount" value={formatCurrency(booking.total_amount)} bold />
          <Row label="Amount Paid" value={formatCurrency(booking.amount_paid)} />
          <Row label="Outstanding" value={formatCurrency(booking.outstanding_balance)} bold={booking.outstanding_balance > 0} />
          <div className="pt-1">
            <Badge variant={booking.payment_status === 'paid' ? 'success' : booking.payment_status === 'partial' ? 'warning' : 'danger'}>
              {booking.payment_status?.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => setStatusDialog(true)}>Update Status</Button>
        <Button onClick={() => setPayDialog(true)}>
          <Plus size={16} /> Record Payment
        </Button>
      </div>

      {/* Payments history */}
      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium font-mono text-gray-700">{p.receipt_number}</p>
                  <p className="text-xs text-gray-400">{formatDate(p.payment_date)} · {p.payment_method?.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(p.amount)}</span>
                  <button onClick={() => handleDownloadReceipt(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <Download size={16} />
                  </button>
                  <button onClick={() => shareReceiptWhatsApp({ ...p, clientName: booking.client?.full_name, apartmentNumber: booking.apartment?.apartment_number, location: booking.apartment?.location?.name, checkIn: booking.check_in_date, checkOut: booking.check_out_date, totalAmount: booking.total_amount, outstandingBalance: booking.outstanding_balance, bookingRef: booking.booking_reference, receiptNumber: p.receipt_number, amountPaid: p.amount, paymentDate: p.payment_date, paymentMethod: p.payment_method }, booking.client?.phone)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={payDialog} onClose={() => setPayDialog(false)}>
        <DialogHeader onClose={() => setPayDialog(false)}>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
            Outstanding: <strong>{formatCurrency(booking.outstanding_balance)}</strong>
          </div>
          <div>
            <Label>Amount (ZMW)</Label>
            <Input type="number" min="1" placeholder="0.00"
              value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label>Payment Method</Label>
            <Select value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setPayDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={recordPayment} disabled={saving}>
            {saving ? 'Saving…' : 'Save Payment'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={statusDialog} onClose={() => setStatusDialog(false)}>
        <DialogHeader onClose={() => setStatusDialog(false)}>
          <DialogTitle>Update Booking Status</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>New Status</Label>
            <Select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              <option value="">Select…</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              {isAdmin && <option value="cancelled">Cancelled</option>}
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setStatusDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={updateStatus} disabled={saving || !newStatus}>
            {saving ? 'Updating…' : 'Update'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value}</span>
    </div>
  )
}
