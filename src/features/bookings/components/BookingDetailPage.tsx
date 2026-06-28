import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/shared/ui/Dialog'
import { Select } from '@/shared/ui/Select'
import { Label } from '@/shared/ui/Label'
import { Input } from '@/shared/ui/Input'
import { formatCurrency, formatDate } from '@/shared/lib/bookingUtils'
import { downloadReceipt, shareReceiptWhatsApp, type ReceiptData } from '@/shared/lib/receiptGenerator'
import { AlertTriangle, ChevronLeft, Download, Share2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { BOOKING_STATUS, BOOKING_STATUS_BADGE, PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_BADGE, getBadge } from '@/shared/constants/status'
import type { BookingStatus } from '@/shared/constants/status'
import { cancelBooking, updateBookingStatus } from '../api'
import { recordPayment } from '@/features/payments/api'
import { validatePaymentAmount } from '@/features/payments/validators'
import { validateCancellationReason } from '../validators'
import { useBookingDetail } from '../useBookingDetail'

interface ReceiptablePayment {
  receipt_number: string
  payment_date: string
  payment_method: string
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAdmin, isRestricted, locationId, authReady } = useAuth()
  const { booking: rawBooking, payments, accessDenied, loading, refetch } = useBookingDetail(id!, { isRestricted, locationId, authReady })

  const [payDialog, setPayDialog] = useState(false)
  const [statusDialog, setStatusDialog] = useState(false)
  const [cancelDialog, setCancelDialog] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash' })
  const [payError, setPayError] = useState<string | null>(null)
  const [newStatus, setNewStatus] = useState<string>('')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (accessDenied) navigate('/bookings')
  }, [accessDenied, navigate])

  if (loading) return <div className="p-4 text-center text-gray-400 py-16">Loading…</div>
  if (!rawBooking) return <div className="p-4 text-center text-gray-400 py-16">Booking not found</div>
  // Closures below don't inherit the narrowing from the check above (TS
  // doesn't propagate flow narrowing into nested function bodies) — this
  // const has a fixed, already-non-null type instead.
  const booking = rawBooking

  function receiptPayload(payment: ReceiptablePayment, amountPaid: number, outstandingBalance: number): ReceiptData {
    return {
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
      amountPaid,
      outstandingBalance,
      paymentMethod: payment.payment_method,
      staffName: user?.email,
      bookingRef: booking.booking_reference,
    }
  }

  async function handleRecordPayment() {
    const { valid, value, error } = validatePaymentAmount(payForm.amount, booking.outstanding_balance)
    if (!valid) {
      setPayError(error)
      return
    }
    setSaving(true)
    try {
      const data = await recordPayment({
        bookingId: id!,
        amount: value!,
        paymentMethod: payForm.payment_method,
        paymentDate: new Date().toISOString().split('T')[0],
      })
      toast.success(`Payment recorded — ${data.receipt_number}`)
      downloadReceipt(receiptPayload(
        { receipt_number: data.receipt_number, payment_date: new Date().toISOString().split('T')[0], payment_method: payForm.payment_method },
        value!,
        (booking.outstanding_balance || 0) - value!,
      ))
      setPayDialog(false)
      setPayForm({ amount: '', payment_method: 'cash' })
      setPayError(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateStatus() {
    if (!newStatus) return
    if (newStatus === BOOKING_STATUS.CHECKED_OUT && booking.outstanding_balance > 0) {
      const confirmed = window.confirm(`Client has outstanding balance of ${formatCurrency(booking.outstanding_balance)}. Proceed with checkout?`)
      if (!confirmed) return
    }
    setSaving(true)
    try {
      await updateBookingStatus(id!, newStatus as BookingStatus)
      toast.success('Status updated')
      setStatusDialog(false)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelBooking() {
    const { valid, value, error } = validateCancellationReason(cancelReason)
    if (!valid) {
      setCancelError(error)
      return
    }
    const confirmed = window.confirm('Cancel this booking and release the apartment? Payment history will be kept for audit.')
    if (!confirmed) return

    setSaving(true)
    try {
      await cancelBooking(id!, value!, user?.email, booking.notes)
      toast.success('Booking cancelled and apartment released')
      setCancelDialog(false)
      setCancelReason('')
      setCancelError(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function handleDownloadReceipt(payment: ReceiptablePayment & { amount: number }) {
    try {
      downloadReceipt(receiptPayload(payment, payment.amount, booking.outstanding_balance))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function handleShareReceipt(payment: ReceiptablePayment & { amount: number }) {
    try {
      shareReceiptWhatsApp(receiptPayload(payment, payment.amount, booking.outstanding_balance), booking.client?.phone)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const sb = getBadge(BOOKING_STATUS_BADGE, booking.booking_status)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => navigate('/bookings')} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{booking.booking_reference}</h1>
          <div className="flex items-center gap-2">
            <Badge variant={sb.variant}>{sb.label}</Badge>
            {booking.created_at && <span className="text-xs text-gray-400">Booked {formatDate(booking.created_at)}</span>}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Client</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm pt-0">
          <p className="font-semibold text-gray-800">{booking.client?.full_name}</p>
          <p className="text-gray-500">{booking.client?.phone}</p>
          {booking.client?.nrc_or_passport && <p className="text-gray-400">NRC: {booking.client.nrc_or_passport}</p>}
          {booking.client?.company && <p className="text-gray-400">{booking.client.company}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Apartment</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm pt-0">
          <p className="font-semibold text-gray-800">{booking.apartment?.apartment_number} — {booking.apartment?.type}</p>
          <p className="text-gray-500">{booking.apartment?.location?.name}</p>
          <p className="text-gray-400">{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)} ({booking.number_of_days} nights)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm pt-0">
          <Row label="Total Amount" value={formatCurrency(booking.total_amount)} bold />
          <Row label="Amount Paid" value={formatCurrency(booking.amount_paid)} />
          <Row label="Outstanding" value={formatCurrency(booking.outstanding_balance)} bold={booking.outstanding_balance > 0} />
          {booking.booking_status === BOOKING_STATUS.CANCELLED && booking.outstanding_balance > 0 && (
            <p className="text-xs text-gray-400">Booking is cancelled — this balance won't be collected through the app.</p>
          )}
          <div className="pt-1">
            <Badge variant={getBadge(PAYMENT_STATUS_BADGE, booking.payment_status).variant}>
              {booking.payment_status?.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => setStatusDialog(true)}>Update Status</Button>
        <Button onClick={() => setPayDialog(true)} disabled={booking.booking_status === BOOKING_STATUS.CANCELLED}>
          <Plus size={16} /> Record Payment
        </Button>
      </div>

      {isAdmin && booking.booking_status !== BOOKING_STATUS.CANCELLED && (
        <Button variant="destructive" className="w-full" onClick={() => setCancelDialog(true)}>
          <AlertTriangle size={16} /> Cancel / Reverse Booking
        </Button>
      )}

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
                  <button onClick={() => handleDownloadReceipt(p)} aria-label="Download receipt" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <Download size={16} />
                  </button>
                  <button onClick={() => handleShareReceipt(p)} aria-label="Share receipt on WhatsApp" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={payDialog} onClose={() => setPayDialog(false)}>
        <DialogHeader onClose={() => setPayDialog(false)}>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
            Outstanding: <strong>{formatCurrency(booking.outstanding_balance)}</strong>
          </div>
          <div>
            <Label htmlFor="payment-amount">Amount (ZMW)</Label>
            <Input id="payment-amount" type="number" min="1" placeholder="0.00"
              value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} aria-invalid={!!payError} />
            {payError && <p className="text-xs text-red-500 mt-1">{payError}</p>}
          </div>
          <div>
            <Label htmlFor="payment-method">Payment Method</Label>
            <Select id="payment-method" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
              {PAYMENT_METHOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setPayDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleRecordPayment} disabled={saving}>
            {saving ? 'Saving…' : 'Save Payment'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={statusDialog} onClose={() => setStatusDialog(false)}>
        <DialogHeader onClose={() => setStatusDialog(false)}>
          <DialogTitle>Update Booking Status</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label htmlFor="new-status">New Status</Label>
            <Select id="new-status" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              <option value="">Select…</option>
              <option value={BOOKING_STATUS.CONFIRMED}>Confirmed</option>
              <option value={BOOKING_STATUS.CHECKED_IN}>Checked In</option>
              <option value={BOOKING_STATUS.CHECKED_OUT}>Checked Out</option>
              {isAdmin && <option value={BOOKING_STATUS.CANCELLED}>Cancelled</option>}
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setStatusDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleUpdateStatus} disabled={saving || !newStatus}>
            {saving ? 'Updating…' : 'Update'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={cancelDialog} onClose={() => setCancelDialog(false)}>
        <DialogHeader onClose={() => setCancelDialog(false)}>
          <DialogTitle>Cancel / Reverse Booking</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            This will mark the booking as cancelled and make the apartment available again. Existing payments and receipts stay saved for audit and refund tracking.
          </div>
          <div>
            <Label htmlFor="cancel-reason">Cancellation Reason</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Guest cancelled, duplicate booking, date change..."
              aria-invalid={!!cancelError}
            />
            {cancelError && <p className="text-xs text-red-500 mt-1">{cancelError}</p>}
          </div>
          {booking.amount_paid > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Paid amount on record: <strong>{formatCurrency(booking.amount_paid)}</strong>. Record any refund outside this cancellation step until refund tracking is added.
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setCancelDialog(false)}>Keep Booking</Button>
          <Button variant="destructive" className="flex-1" onClick={handleCancelBooking} disabled={saving}>
            {saving ? 'Cancelling...' : 'Cancel Booking'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value}</span>
    </div>
  )
}
