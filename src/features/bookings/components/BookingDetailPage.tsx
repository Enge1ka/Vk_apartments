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
import { formatCurrency, formatDate, todayLocalISO, calcDays } from '@/shared/lib/bookingUtils'
import { getErrorMessage } from '@/shared/lib/utils'
import { downloadReceipt, shareReceiptWhatsApp } from '@/shared/lib/receiptLazy'
import type { ReceiptData } from '@/shared/lib/receiptGenerator'
import { AlertTriangle, ChevronLeft, Download, Share2, Plus, LogIn, LogOut, CalendarPlus, CalendarMinus, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { BOOKING_STATUS, BOOKING_STATUS_BADGE, PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_BADGE, getBadge } from '@/shared/constants/status'
import type { BookingStatus } from '@/shared/constants/status'
import { cancelBooking, updateRoomStatus, extendRoom, extendRoomNewRate, shortenRoom, type BookingRoom } from '../api'
import { recordPayment, recordRefund } from '@/features/payments/api'
import { validatePaymentAmount } from '@/features/payments/validators'
import { validateCancellationReason } from '../validators'
import { useBookingDetail } from '../useBookingDetail'

interface ReceiptablePayment {
  receipt_number: string
  payment_date: string
  payment_method: string
}

// An apartment can hold several contiguous segments (e.g. original nights +
// an extension at a different rate). Group them so a single guest's stay reads
// as one apartment with a rate change, not several rooms.
interface ApartmentGroup {
  apartmentId: string
  apartmentNumber: string
  apartmentType?: string
  locationName?: string
  segments: BookingRoom[]
  latest: BookingRoom
  groupStatus: BookingStatus
  total: number
}

function groupByApartment(rooms: BookingRoom[]): ApartmentGroup[] {
  const map = new Map<string, BookingRoom[]>()
  for (const r of rooms) {
    const arr = map.get(r.apartment_id) ?? []
    arr.push(r)
    map.set(r.apartment_id, arr)
  }
  const groups: ApartmentGroup[] = []
  for (const [apartmentId, segs] of map) {
    segs.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))
    const latest = segs.reduce((m, s) => (s.check_out_date > m.check_out_date ? s : m), segs[0])
    const live = segs.filter(s => s.status !== BOOKING_STATUS.CANCELLED)
    const groupStatus: BookingStatus =
      live.length === 0 ? BOOKING_STATUS.CANCELLED
        : live.some(s => s.status === BOOKING_STATUS.CHECKED_IN) ? BOOKING_STATUS.CHECKED_IN
          : live.every(s => s.status === BOOKING_STATUS.CHECKED_OUT) ? BOOKING_STATUS.CHECKED_OUT
            : BOOKING_STATUS.CONFIRMED
    groups.push({
      apartmentId,
      apartmentNumber: segs[0].apartment?.apartment_number ?? '—',
      apartmentType: segs[0].apartment?.type,
      locationName: segs[0].apartment?.location?.name ?? undefined,
      segments: segs,
      latest,
      groupStatus,
      total: segs.reduce((s, x) => s + Number(x.line_total || 0), 0),
    })
  }
  return groups
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
  const [roomToExtend, setRoomToExtend] = useState<BookingRoom | null>(null)
  const [extendForm, setExtendForm] = useState({ check_out_date: '', rate_per_day: '', reprice: false })
  const [roomToShorten, setRoomToShorten] = useState<BookingRoom | null>(null)
  const [shortenDate, setShortenDate] = useState('')
  const [refundDialog, setRefundDialog] = useState(false)
  const [refundForm, setRefundForm] = useState({ amount: '', payment_method: 'cash', reason: '' })
  const [refundError, setRefundError] = useState<string | null>(null)
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
  const apartmentGroups = groupByApartment(booking.rooms)

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
      await downloadReceipt(receiptPayload(
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

  // Check-in/out for every relevant segment of an apartment at once (an
  // apartment may hold more than one contiguous segment after an extension).
  async function handleGroupStatus(group: ApartmentGroup, newStatus: BookingStatus) {
    const from = newStatus === BOOKING_STATUS.CHECKED_IN ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.CHECKED_IN
    const targets = group.segments.filter(s => s.status === from)
    if (targets.length === 0) return
    if (newStatus === BOOKING_STATUS.CHECKED_OUT && booking.outstanding_balance > 0) {
      const confirmed = window.confirm(`This booking still has an outstanding balance of ${formatCurrency(booking.outstanding_balance)}. Check this apartment out anyway?`)
      if (!confirmed) return
    }
    setSaving(true)
    try {
      for (const t of targets) await updateRoomStatus(t.id, newStatus)
      toast.success(newStatus === BOOKING_STATUS.CHECKED_IN ? 'Checked in' : 'Checked out')
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Extend is always applied to the latest segment of the apartment.
  function openExtend(room: BookingRoom) {
    setRoomToExtend(room)
    setExtendForm({ check_out_date: '', rate_per_day: String(room.rate_per_day), reprice: false })
  }

  async function handleExtend() {
    if (!roomToExtend) return
    if (!extendForm.check_out_date) { toast.error('Pick the new check-out date'); return }
    if (extendForm.check_out_date <= roomToExtend.check_out_date) {
      toast.error('New check-out must be later than the current one'); return
    }
    const rate = Number(extendForm.rate_per_day)
    if (!rate || rate <= 0) { toast.error('Rate must be greater than 0'); return }
    const sameRate = rate === roomToExtend.rate_per_day
    setSaving(true)
    try {
      if (extendForm.reprice) {
        // Re-price the whole (latest) room line at the new rate.
        await extendRoom(roomToExtend.id, extendForm.check_out_date, rate)
      } else if (sameRate) {
        // Same rate — just move the check-out on the existing line.
        await extendRoom(roomToExtend.id, extendForm.check_out_date)
      } else {
        // New rate for the extra nights only — add a contiguous segment.
        await extendRoomNewRate(roomToExtend.id, extendForm.check_out_date, rate)
      }
      toast.success('Stay extended')
      setRoomToExtend(null)
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function openShorten(room: BookingRoom) {
    setRoomToShorten(room)
    setShortenDate('')
  }

  async function handleShorten() {
    if (!roomToShorten) return
    if (!shortenDate) { toast.error('Pick the new check-out date'); return }
    if (shortenDate >= roomToShorten.check_out_date) { toast.error('New check-out must be earlier than the current one'); return }
    if (shortenDate <= roomToShorten.check_in_date) { toast.error('A stay must be at least one night'); return }
    setSaving(true)
    try {
      await shortenRoom(roomToShorten.id, shortenDate)
      toast.success('Stay shortened')
      setRoomToShorten(null)
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRecordRefund() {
    const amt = Number(refundForm.amount)
    if (!amt || amt <= 0) { setRefundError('Enter a valid amount'); return }
    if (amt > booking.amount_paid) { setRefundError('Refund cannot exceed the amount paid'); return }
    setSaving(true)
    try {
      const data = await recordRefund({ bookingId: id!, amount: amt, paymentMethod: refundForm.payment_method, reason: refundForm.reason || null })
      toast.success(`Refund recorded — ${data.receipt_number}`)
      setRefundDialog(false)
      setRefundForm({ amount: '', payment_method: 'cash', reason: '' })
      setRefundError(null)
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

  async function handleDownloadReceipt(payment: ReceiptablePayment & { amount: number }) {
    try {
      await downloadReceipt(receiptPayload(payment, payment.amount, booking.outstanding_balance))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleShareReceipt(payment: ReceiptablePayment & { amount: number }) {
    try {
      await shareReceiptWhatsApp(receiptPayload(payment, payment.amount, booking.outstanding_balance), booking.client?.phone)
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
        <CardHeader><CardTitle>Rooms ({apartmentGroups.length})</CardTitle></CardHeader>
        <CardContent className="pt-0 divide-y divide-gray-50">
          {apartmentGroups.map(group => {
            const gb = getBadge(BOOKING_STATUS_BADGE, group.groupStatus)
            const active = group.groupStatus === BOOKING_STATUS.CONFIRMED || group.groupStatus === BOOKING_STATUS.CHECKED_IN
            return (
              <div key={group.apartmentId} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-semibold text-gray-800">{group.apartmentNumber}{group.apartmentType ? ` — ${group.apartmentType}` : ''}</p>
                    <p className="text-gray-500 text-xs">{group.locationName}</p>
                    <div className="mt-1 space-y-0.5">
                      {group.segments.map(seg => (
                        <p key={seg.id} className="text-gray-400 text-xs">
                          {formatDate(seg.check_in_date)} → {formatDate(seg.check_out_date)} · {seg.number_of_days}n · {formatCurrency(seg.rate_per_day)}/night
                          {seg.status === BOOKING_STATUS.CANCELLED && <span className="text-red-400"> · cancelled</span>}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={gb.variant}>{gb.label}</Badge>
                    <p className="text-xs font-semibold text-gray-700 mt-1">{formatCurrency(group.total)}</p>
                  </div>
                </div>
                {active && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.segments.some(s => s.status === BOOKING_STATUS.CONFIRMED) && (
                      <Button size="sm" variant="outline" onClick={() => handleGroupStatus(group, BOOKING_STATUS.CHECKED_IN)} disabled={saving}>
                        <LogIn size={14} /> Check In
                      </Button>
                    )}
                    {group.segments.some(s => s.status === BOOKING_STATUS.CHECKED_IN) && (
                      <Button size="sm" variant="outline" onClick={() => handleGroupStatus(group, BOOKING_STATUS.CHECKED_OUT)} disabled={saving}>
                        <LogOut size={14} /> Check Out
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openExtend(group.latest)} disabled={saving}>
                      <CalendarPlus size={14} /> Extend
                    </Button>
                    {group.latest.number_of_days > 1 && (
                      <Button size="sm" variant="outline" onClick={() => openShorten(group.latest)} disabled={saving}>
                        <CalendarMinus size={14} /> Shorten
                      </Button>
                    )}
                  </div>
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
          {booking.outstanding_balance < 0 ? (
            <Row label="Credit (overpaid)" value={formatCurrency(-booking.outstanding_balance)} bold />
          ) : (
            <Row label="Outstanding" value={formatCurrency(booking.outstanding_balance)} bold={booking.outstanding_balance > 0} />
          )}
          {booking.outstanding_balance < 0 && (
            <p className="text-xs text-amber-600">This booking is overpaid by {formatCurrency(-booking.outstanding_balance)} — record a refund to return it.</p>
          )}
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

      {isAdmin && booking.amount_paid > 0 && (
        <Button variant="outline" className="w-full" onClick={() => setRefundDialog(true)}>
          <Undo2 size={16} /> Record Refund
        </Button>
      )}

      {isAdmin && !isCancelled && (
        <Button variant="destructive" className="w-full" onClick={() => setCancelDialog(true)}>
          <AlertTriangle size={16} /> Cancel / Reverse Booking
        </Button>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            {payments.map(p => {
              const isRefund = p.payment_type === 'refund'
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium font-mono text-gray-700">{p.receipt_number}{isRefund && <span className="ml-2 text-xs font-sans font-normal text-amber-600">Refund</span>}</p>
                    <p className="text-xs text-gray-400">{formatDate(p.payment_date)} · {p.payment_method?.replace('_', ' ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isRefund ? 'text-amber-600' : 'text-green-600'}`}>
                      {isRefund ? `-${formatCurrency(p.amount)}` : formatCurrency(p.amount)}
                    </span>
                    {!isRefund && (
                      <>
                        <button onClick={() => handleDownloadReceipt(p)} aria-label="Download receipt" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                          <Download size={16} />
                        </button>
                        <button onClick={() => handleShareReceipt(p)} aria-label="Share receipt on WhatsApp" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                          <Share2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
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
              Paid amount on record: <strong>{formatCurrency(booking.amount_paid)}</strong>. After cancelling, this becomes a credit — use <strong>Record Refund</strong> to return it.
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

      <Dialog open={!!roomToExtend} onClose={() => setRoomToExtend(null)}>
        <DialogHeader onClose={() => setRoomToExtend(null)}>
          <DialogTitle>Extend Stay</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          {roomToExtend && (() => {
            const rate = Number(extendForm.rate_per_day) || 0
            const rateChanged = extendForm.rate_per_day !== '' && rate !== roomToExtend.rate_per_day
            const extraNights = extendForm.check_out_date && extendForm.check_out_date > roomToExtend.check_out_date
              ? calcDays(roomToExtend.check_out_date, extendForm.check_out_date) : 0
            // Segment mode: original nights untouched, extra nights at the new rate.
            // Re-price mode: the whole (latest) line is re-priced at the new rate.
            const segmentMode = rateChanged && !extendForm.reprice
            const wholeNights = extendForm.check_out_date && extendForm.check_out_date > roomToExtend.check_in_date
              ? calcDays(roomToExtend.check_in_date, extendForm.check_out_date) : 0
            const added = segmentMode ? extraNights * rate
              : extendForm.reprice ? (wholeNights * rate - roomToExtend.line_total)
              : extraNights * roomToExtend.rate_per_day
            return (
              <>
                <div className="bg-gray-50 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-gray-800">{roomToExtend.apartment?.apartment_number}</p>
                  <p className="text-xs text-gray-500">Currently to {formatDate(roomToExtend.check_out_date)} · {formatCurrency(roomToExtend.rate_per_day)}/night</p>
                </div>
                <div>
                  <Label htmlFor="extend-date">New Check-out Date</Label>
                  <Input id="extend-date" type="date" min={roomToExtend.check_out_date}
                    value={extendForm.check_out_date} onChange={e => setExtendForm(f => ({ ...f, check_out_date: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="extend-rate">Rate per Night (ZMW)</Label>
                  <Input id="extend-rate" type="number" min="0" step="0.01"
                    value={extendForm.rate_per_day} onChange={e => setExtendForm(f => ({ ...f, rate_per_day: e.target.value }))} />
                </div>
                {rateChanged && (
                  <label className="flex items-start gap-2 text-xs text-gray-600">
                    <input type="checkbox" className="mt-0.5" checked={extendForm.reprice} onChange={e => setExtendForm(f => ({ ...f, reprice: e.target.checked }))} />
                    <span>Re-price the whole stay at this rate. Leave unticked to keep the original nights at {formatCurrency(roomToExtend.rate_per_day)} and bill only the extra nights at {formatCurrency(rate)}.</span>
                  </label>
                )}
                {extraNights > 0 && (
                  <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                    {segmentMode
                      ? <>Extra {extraNights} night{extraNights > 1 ? 's' : ''} @ {formatCurrency(rate)} · <span className="font-medium">+{formatCurrency(added)}</span> to the balance</>
                      : extendForm.reprice
                        ? <>Whole room re-priced to <strong>{formatCurrency(wholeNights * rate)}</strong> ({wholeNights} nights) · <span className="font-medium">{added >= 0 ? '+' : ''}{formatCurrency(added)}</span></>
                        : <>Extra {extraNights} night{extraNights > 1 ? 's' : ''} · <span className="font-medium">+{formatCurrency(added)}</span> to the balance</>}
                  </div>
                )}
              </>
            )
          })()}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setRoomToExtend(null)}>Cancel</Button>
          <Button className="flex-1" onClick={handleExtend} disabled={saving}>
            {saving ? 'Extending…' : 'Extend Stay'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!roomToShorten} onClose={() => setRoomToShorten(null)}>
        <DialogHeader onClose={() => setRoomToShorten(null)}>
          <DialogTitle>Shorten Stay</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          {roomToShorten && (() => {
            const nights = shortenDate ? calcDays(roomToShorten.check_in_date, shortenDate) : 0
            const newRoomTotal = nights * roomToShorten.rate_per_day
            const valid = nights > 0 && shortenDate < roomToShorten.check_out_date
            return (
              <>
                <div className="bg-gray-50 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-gray-800">{roomToShorten.apartment?.apartment_number}</p>
                  <p className="text-xs text-gray-500">Currently {formatDate(roomToShorten.check_in_date)} → {formatDate(roomToShorten.check_out_date)} · {formatCurrency(roomToShorten.line_total)}</p>
                </div>
                <div>
                  <Label htmlFor="shorten-date">New (earlier) Check-out Date</Label>
                  <Input id="shorten-date" type="date" min={roomToShorten.check_in_date} max={roomToShorten.check_out_date}
                    value={shortenDate} onChange={e => setShortenDate(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Rate stays the same; the room is billed for fewer nights.</p>
                </div>
                {valid && (
                  <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                    New room total: <strong>{formatCurrency(newRoomTotal)}</strong> ({nights} nights)
                    {newRoomTotal < roomToShorten.line_total && <> · <span className="font-medium">−{formatCurrency(roomToShorten.line_total - newRoomTotal)}</span> off the total</>}
                  </div>
                )}
              </>
            )
          })()}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setRoomToShorten(null)}>Cancel</Button>
          <Button className="flex-1" onClick={handleShorten} disabled={saving}>
            {saving ? 'Saving…' : 'Shorten Stay'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={refundDialog} onClose={() => setRefundDialog(false)}>
        <DialogHeader onClose={() => setRefundDialog(false)}>
          <DialogTitle>Record Refund</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800">
            Paid on record: <strong>{formatCurrency(booking.amount_paid)}</strong>
            {booking.outstanding_balance < 0 && <> · overpaid by <strong>{formatCurrency(-booking.outstanding_balance)}</strong></>}
          </div>
          <div>
            <Label htmlFor="refund-amount">Refund Amount (ZMW)</Label>
            <Input id="refund-amount" type="number" min="1" max={booking.amount_paid} placeholder="0.00"
              value={refundForm.amount} onChange={e => setRefundForm(f => ({ ...f, amount: e.target.value }))} aria-invalid={!!refundError} />
            {refundError && <p className="text-xs text-red-500 mt-1">{refundError}</p>}
          </div>
          <div>
            <Label htmlFor="refund-method">Refund Method</Label>
            <Select id="refund-method" value={refundForm.payment_method} onChange={e => setRefundForm(f => ({ ...f, payment_method: e.target.value }))}>
              {PAYMENT_METHOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="refund-reason">Reason (optional)</Label>
            <Input id="refund-reason" placeholder="Early checkout, cancellation…"
              value={refundForm.reason} onChange={e => setRefundForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setRefundDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleRecordRefund} disabled={saving}>
            {saving ? 'Saving…' : 'Record Refund'}
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
