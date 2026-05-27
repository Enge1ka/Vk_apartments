import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { formatCurrency, formatDate, generateReceiptNumber, getPaymentStatus } from '@/lib/bookingUtils'
import { downloadReceipt } from '@/lib/receiptGenerator'
import { Search, Download, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

export default function Payments() {
  const { user, isRestricted, locationId } = useAuth()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [recordDialog, setRecordDialog] = useState(false)
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingResults, setBookingResults] = useState([])
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchPayments() }, [isRestricted, locationId])

  async function fetchPayments() {
    setLoading(true)

    let bookingIds = null
    if (isRestricted && locationId) {
      const { data: apts } = await supabase.from('apartments').select('id').eq('location_id', locationId)
      const aptIds = (apts || []).map(a => a.id)
      if (aptIds.length === 0) { setPayments([]); setLoading(false); return }
      const { data: bks } = await supabase.from('bookings').select('id').in('apartment_id', aptIds)
      bookingIds = (bks || []).map(b => b.id)
      if (bookingIds.length === 0) { setPayments([]); setLoading(false); return }
    }

    let query = supabase
      .from('payments')
      .select(`
        *, booking:bookings(
          booking_reference, outstanding_balance, total_amount,
          client:clients(full_name, phone, nrc_or_passport),
          apartment:apartments(apartment_number, location:locations(name))
        )
      `)
      .order('created_at', { ascending: false })

    if (bookingIds) query = query.in('booking_id', bookingIds)

    const { data } = await query
    setPayments(data || [])
    setLoading(false)
  }

  async function searchBookings() {
    if (!bookingSearch.trim()) return

    let aptIds = null
    if (isRestricted && locationId) {
      const { data: apts } = await supabase.from('apartments').select('id').eq('location_id', locationId)
      aptIds = (apts || []).map(a => a.id)
    }

    let query = supabase
      .from('bookings')
      .select(`
        id, booking_reference, total_amount, amount_paid, outstanding_balance, check_in_date, check_out_date,
        client:clients(id, full_name, phone, nrc_or_passport),
        apartment:apartments(apartment_number, location:locations(name))
      `)
      .ilike('booking_reference', `%${bookingSearch}%`)
      .neq('booking_status', 'cancelled')
      .limit(5)

    if (aptIds) query = query.in('apartment_id', aptIds)

    const { data } = await query
    setBookingResults(data || [])
  }

  async function savePayment() {
    if (!selectedBooking) { toast.error('Select a booking'); return }
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('Enter a valid amount'); return }
    if (Number(payForm.amount) > Number(selectedBooking.outstanding_balance || 0)) {
      toast.error('Payment cannot exceed the outstanding balance')
      return
    }
    setSaving(true)

    const { count } = await supabase.from('payments').select('*', { count: 'exact', head: true })
      .gte('created_at', `${new Date().getFullYear()}-01-01`)
    const receiptNum = generateReceiptNumber((count || 0) + 1)

    const { error } = await supabase.from('payments').insert({
      booking_id: selectedBooking.id,
      client_id: selectedBooking.client?.id,
      amount: Number(payForm.amount),
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: payForm.payment_method,
      receipt_number: receiptNum,
      recorded_by: user?.id,
    })

    if (error) { toast.error(error.message); setSaving(false); return }

    const newPaid = (selectedBooking.amount_paid || 0) + Number(payForm.amount)
    const newStatus = getPaymentStatus(selectedBooking.total_amount, newPaid)
    const newBalance = Math.max(0, (selectedBooking.total_amount || 0) - newPaid)
    await supabase.from('bookings').update({ amount_paid: newPaid, outstanding_balance: newBalance, payment_status: newStatus }).eq('id', selectedBooking.id)

    toast.success(`Payment recorded — ${receiptNum}`)
    setRecordDialog(false)
    setSelectedBooking(null)
    setBookingSearch('')
    setBookingResults([])
    setPayForm({ amount: '', payment_method: 'cash' })
    fetchPayments()
    setSaving(false)
  }

  const filtered = payments.filter(p => {
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search receipt, booking, client…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="h-10 text-xs">
          <option value="">All methods</option>
          <option value="cash">Cash</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="card">Card</option>
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
                      <button
                        onClick={() => downloadReceipt({
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
                        })}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      >
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

      {/* Record Payment Dialog */}
      <Dialog open={recordDialog} onClose={() => setRecordDialog(false)}>
        <DialogHeader onClose={() => setRecordDialog(false)}>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>Search Booking</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Booking ref e.g. VKL-2026-0001"
                value={bookingSearch}
                onChange={e => setBookingSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchBookings()}
              />
              <Button size="sm" variant="outline" onClick={searchBookings}>Find</Button>
            </div>
          </div>

          {bookingResults.length > 0 && (
            <div className="space-y-2">
              {bookingResults.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setSelectedBooking(b); setBookingResults([]); setPayForm(f => ({ ...f, amount: b.outstanding_balance })) }}
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
                <Label>Amount (ZMW)</Label>
                <Input type="number" min="1"
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
