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
import { formatCurrency, formatDate, todayLocalISO } from '@/shared/lib/bookingUtils'
import { getErrorMessage } from '@/shared/lib/utils'
import { downloadReceipt, shareReceiptWhatsApp, type ReceiptData } from '@/shared/lib/receiptGenerator'
import { AlertTriangle, ChevronLeft, Download, Share2, Plus, LogIn, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { BOOKING_STATUS, BOOKING_STATUS_BADGE, PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_BADGE, getBadge } from '@/shared/constants/status'
import type { BookingStatus } from '@/shared/constants/status'
import { cancelBooking, updateRoomStatus } from '../api'
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
  const [cancelDialog, setCancelDialog] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash' })
  const [payError, setPayError] = useState<string | null>(null)
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

  // The receipt is for the whole booking (one combined payment), so it lists
  // every room with its own dates and rate.
  function receiptPayload(payment: ReceiptablePayment, amountPaid: number, outstandingBalance: number): ReceiptData {
    return {
      receiptNumber: payment.receipt_number,
      paymentDate: payment.payment_date,
      clientName: booking.client?.full_name,
      clientPhone: booking.client?.phone,
      clientNRC: booking.client?.nrc_or_passport,
      location: booking.rooms[0]?.apartment?.location?.name,
      rooms: booking.rooms.map(r => ({
        apartmentNumber: r.apartment?.apartment_number,
        checkIn: r.check_in_date,
        checkOut: r.check_out_date,
        numberOfDays: r.number_of_days,
        ratePerDay: r.rate_per_day,
        lineTotal: r.line_total,
      })),
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
        paymentDate: todayLocalISO(),
      })
      toast.success(`Payment recorded — ${data.receipt_number}`)
      downloadReceipt(receiptPayload(
        { receipt_number: data.receipt_number, payment_date: todayLocalISO(), payment_method: payForm.payment_method },
        value!,
        (booking.outstanding_balance || 0) - value!,
      ))
      setPayDialog(false)
      setPayForm({ amount: '', payment_method: 'cash' })
      setPayError(null)
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Per-room check-in / check-out.
  async function handleRoomStatus(roomId: string, newStatus: BookingStatus) {
    if (newStatus === BOOKING_STATUS.CHECKED_OUT && booking.outstanding_balance > 0) {
      const confirmed = window.confirm(`This booking still has an outstanding balance of ${formatCurrency(booking.outstanding_balance)}. Check this room out anyway?`)
      if (!confirmed) return
    }
    setSaving(true)
    try {
      await updateRoomStatus(roomId, newStatus)
      toast.success(newStatus === BOOKING_STATUS.CHECKED_IN ? 'Room checked in' : 'Room checked out')
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
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
    const confirmed = window.confirm('Cancel this booking and release all its rooms? Payment history will be kept for audit.')
    if (!confirmed) return

    setSaving(true)
    try {
      await cancelBooking(id!, value!, user?.email)
      toast.success('Booking cancelled and rooms released')
      setCancelDialog(false)
      setCancelReason('')
      setCancelError(null)
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function handleDownloadReceipt(payment: ReceiptablePayment & { amount: number }) {
    try {
      downloadReceipt(receiptPayload(payment, payment.amount, booking.outstanding_balance))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  function handleShareReceipt(payment: ReceiptablePayment & { amount: number }) {
    try {
      shareReceiptWhatsApp(receiptPayload(payment, payment.amount, booking.outstanding_balance), booking.client?.phone)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const sb = getBadge(BOOKING_STATUS_BADGE, booking.booking_status)
  const isCancelled = booking.booking_status === BOOKING_STATUS.CANCELLED

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
        <CardHeader><CardTitle>Rooms ({booking.rooms.length})</CardTitle></CardHeader>
        <CardContent className="pt-0 divide-y divide-gray-50">
          {booking.rooms.map(room => {
            const rb = getBadge(BOOKING_STATUS_BADGE, room.status)
            return (
              <div key={room.id} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-semibold text-gray-800">{room.apartment?.apartment_number}{room.apartment?.type ? ` — ${room.apartment.type}` : ''}</p>
                    <p className="text-gray-500 text-xs">{room.apartment?.location?.name}</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {formatDate(room.check_in_date)} → {formatDate(room.check_out_date)} · {room.number_of_days} nights · {formatCurrency(room.rate_per_day)}/night
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={rb.variant}>{rb.label}</Badge>
                    <p className="text-xs font-semibold text-gray-700 mt-1">{formatCurrency(room.line_total)}</p>
                  </div>
                </div>
                {room.status === BOOKING_STATUS.CONFIRMED && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => handleRoomStatus(room.id, BOOKING_STATUS.CHECKED_IN)} disabled={saving}>
                    <LogIn size={14} /> Check In
                  </Button>
                )}
                {room.status === BOOKING_STATUS.CHECKED_IN && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => handleRoomStatus(room.id, BOOKING_STATUS.CHECKED_OUT)} disabled={saving}>
                    <LogOut size={14} /> Check Out
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm pt-0">
          <Row label="Total Amount" value={formatCurrency(booking.total_amount)} bold />
          <Row label="Amount Paid" value={formatCurrency(booking.amount_paid)} />
          <Row label="Outstanding" value={formatCurrency(booking.outstanding_balance)} bold={booking.outstanding_balance > 0} />
          {isCancelled && booking.outstanding_balance > 0 && (
            <p className="text-xs text-gray-400">Booking is cancelled — this balance won't be collected through the app.</p>
          )}
          <div className="pt-1">
            <Badge variant={getBadge(PAYMENT_STATUS_BADGE, booking.payment_status).variant}>
              {booking.payment_status?.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={() => setPayDialog(true)} disabled={isCancelled}>
        <Plus size={16} /> Record Payment
      </Button>

      {isAdmin && !isCancelled && (
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

      <Dialog open={cancelDialog} onClose={() => setCancelDialog(false)}>
        <DialogHeader onClose={() => setCancelDialog(false)}>
          <DialogTitle>Cancel / Reverse Booking</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            This cancels every room on the booking and makes those apartments available again. Existing payments and receipts stay saved for audit and refund tracking.
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
