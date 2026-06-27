import { useState } from 'react'
import { Card, CardContent } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Select } from '@/shared/ui/Select'
import { Label } from '@/shared/ui/Label'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/shared/ui/Dialog'
import { formatCurrency, formatDate } from '@/shared/lib/bookingUtils'
import { downloadReceipt } from '@/shared/lib/receiptGenerator'
import { Search, Download, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth/useAuth'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { PAYMENT_METHOD, PAYMENT_METHOD_OPTIONS } from '@/shared/constants/status'
import { searchBookingsByReference, type BookingSearchResult } from '@/features/bookings/api'
import { listPayments, recordPayment, type Payment } from '../api'
import { validatePaymentAmount } from '../validators'

export default function PaymentsPage() {
  const { isRestricted, locationId } = useAuth()
  const { data: payments, loading, refetch } = useSupabaseQuery(async () => {
    if (isRestricted && !locationId) return []
    return listPayments({ locationId: isRestricted ? (locationId ?? undefined) : undefined })
  }, [isRestricted, locationId], 'payments.listPayments')

  const [search, setSearch] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [recordDialog, setRecordDialog] = useState(false)
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingResults, setBookingResults] = useState<BookingSearchResult[]>([])
  const [selectedBooking, setSelectedBooking] = useState<BookingSearchResult | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: PAYMENT_METHOD.CASH as string })
  const [payError, setPayError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSearchBookings() {
    if (!bookingSearch.trim()) return
    const results = await searchBookingsByReference(bookingSearch, isRestricted ? locationId : null)
    setBookingResults(results)
  }

  async function savePayment() {
    if (!selectedBooking) { toast.error('Select a booking'); return }
    const { valid, value, error } = validatePaymentAmount(payForm.amount, selectedBooking.outstanding_balance)
    if (!valid) {
      setPayError(error)
      return
    }

    setSaving(true)
    try {
      const data = await recordPayment({ bookingId: selectedBooking.id, amount: value, paymentMethod: payForm.payment_method })
      toast.success(`Payment recorded — ${data.receipt_number}`)
      setRecordDialog(false)
      setSelectedBooking(null)
      setBookingSearch('')
      setBookingResults([])
      setPayForm({ amount: '', payment_method: PAYMENT_METHOD.CASH })
      setPayError(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function handleDownloadReceipt(p: Payment) {
    downloadReceipt({
      receiptNumber: p.receipt_number,
      paymentDate: p.payment_date,
      clientName: p.booking?.client?.full_name,
      clientPhone: p.booking?.client?.phone,
      clientNRC: p.booking?.client?.nrc_or_passport,
      apartmentNumber: p.booking?.apartment?.apartment_number,
      location: p.booking?.apartment?.location?.name,
      totalAmount: p.booking?.total_amount,
      amountPaid: p.amount,
      outstandingBalance: p.booking?.outstanding_balance,
      paymentMethod: p.payment_method,
      bookingRef: p.booking?.booking_reference,
    })
  }

  const filtered = (payments ?? []).filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      p.receipt_number?.toLowerCase().includes(q) ||
      p.booking?.booking_reference?.toLowerCase().includes(q) ||
      p.booking?.client?.full_name?.toLowerCase().includes(q)
    const matchMethod = !filterMethod || p.payment_method === filterMethod
    return matchSearch && matchMethod
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Payments</h1>
        <Button size="sm" onClick={() => setRecordDialog(true)}>+ Record</Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Label htmlFor="payment-search" className="sr-only">Search payments</Label>
          <Input id="payment-search" placeholder="Search receipt, booking, client…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Label htmlFor="filter-payment-method" className="sr-only">Filter by payment method</Label>
        <Select id="filter-payment-method" value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="h-10 text-xs">
          <option value="">All methods</option>
          {PAYMENT_METHOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </Select>
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <CreditCard size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No payments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold font-mono text-sm text-gray-800">{p.receipt_number}</p>
                    <p className="text-xs text-gray-500">{p.booking?.client?.full_name} · {p.booking?.apartment?.apartment_number}</p>
                    <p className="text-xs text-gray-400">{formatDate(p.payment_date)} · {p.payment_method?.replace('_', ' ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{formatCurrency(p.amount)}</p>
                    <div className="flex gap-1 mt-1 justify-end">
                      <button onClick={() => handleDownloadReceipt(p)} aria-label="Download receipt" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                        <Download size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={recordDialog} onClose={() => setRecordDialog(false)}>
        <DialogHeader onClose={() => setRecordDialog(false)}>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label htmlFor="booking-ref-search">Search Booking</Label>
            <div className="flex gap-2">
              <Input
                id="booking-ref-search"
                placeholder="Booking ref e.g. VKL-2026-0001"
                value={bookingSearch}
                onChange={e => setBookingSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchBookings()}
              />
              <Button size="sm" variant="outline" onClick={handleSearchBookings}>Find</Button>
            </div>
          </div>

          {bookingResults.length > 0 && (
            <div className="space-y-2">
              {bookingResults.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setSelectedBooking(b); setBookingResults([]); setPayForm(f => ({ ...f, amount: String(b.outstanding_balance) })) }}
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-colors ${selectedBooking?.id === b.id ? 'border-[#1e3a5f] bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <p className="font-semibold font-mono">{b.booking_reference}</p>
                  <p className="text-gray-500">{b.client?.full_name} · {b.apartment?.apartment_number}</p>
                  <p className="text-red-500 font-medium">Balance: {formatCurrency(b.outstanding_balance)}</p>
                </button>
              ))}
            </div>
          )}

          {selectedBooking && (
            <>
              <div className="bg-blue-50 rounded-xl p-3 text-sm">
                <p className="font-semibold">{selectedBooking.booking_reference}</p>
                <p className="text-blue-700">Outstanding: <strong>{formatCurrency(selectedBooking.outstanding_balance)}</strong></p>
              </div>
              <div>
                <Label htmlFor="record-payment-amount">Amount (ZMW)</Label>
                <Input id="record-payment-amount" type="number" min="1"
                  value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} aria-invalid={!!payError} />
                {payError && <p className="text-xs text-red-500 mt-1">{payError}</p>}
              </div>
              <div>
                <Label htmlFor="record-payment-method">Payment Method</Label>
                <Select id="record-payment-method" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              </div>
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setRecordDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={savePayment} disabled={saving || !selectedBooking}>
            {saving ? 'Saving…' : 'Save Payment'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
