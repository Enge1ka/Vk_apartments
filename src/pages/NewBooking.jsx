import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Card, CardContent } from '@/components/ui/Card'
import { formatCurrency, calcDays, calcTotal, generateBookingRef, generateReceiptNumber, getPaymentStatus } from '@/lib/bookingUtils'
import { downloadReceipt } from '@/lib/receiptGenerator'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'

const STEPS = ['Client', 'Apartment', 'Payment', 'Confirm']

const EMPTY = {
  full_name: '', nrc_or_passport: '', phone: '', email: '', company: '',
  location_id: '', apartment_id: '', check_in_date: '', check_out_date: '',
  rate_per_day: '', amount_to_pay: '', payment_method: 'cash', notes: '',
}

export default function NewBooking() {
  const { user, isRestricted, locationId } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [locations, setLocations] = useState([])
  const [apartments, setApartments] = useState([])
  const [saving, setSaving] = useState(false)

  const days = calcDays(form.check_in_date, form.check_out_date)
  const totalAmount = calcTotal(days, Number(form.rate_per_day) || 0)
  const outstandingBalance = totalAmount - (Number(form.amount_to_pay) || 0)

  useEffect(() => {
    let q = supabase.from('locations').select('*').order('name')
    if (isRestricted && locationId) q = q.eq('id', locationId)
    q.then(({ data }) => {
      setLocations(data || [])
      if (isRestricted && locationId) set('location_id', locationId)
    })
  }, [isRestricted, locationId])

  useEffect(() => {
    if (!form.location_id) { setApartments([]); return }
    supabase
      .from('apartments')
      .select('*')
      .eq('location_id', form.location_id)
      .eq('status', 'available')
      .order('apartment_number')
      .then(({ data }) => setApartments(data || []))
  }, [form.location_id])

  useEffect(() => {
    if (!form.apartment_id) return
    const apt = apartments.find(a => a.id === form.apartment_id)
    if (apt) set('rate_per_day', apt.daily_rate)
  }, [form.apartment_id])

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function field(key) {
    return { value: form[key], onChange: (e) => set(key, e.target.value) }
  }

  function validateStep() {
    if (step === 0) {
      if (!form.full_name || !form.phone) { toast.error('Name and phone are required'); return false }
    }
    if (step === 1) {
      if (!form.location_id || !form.apartment_id || !form.check_in_date || !form.check_out_date) {
        toast.error('Select apartment and dates'); return false
      }
      if (days <= 0) { toast.error('Check-out must be after check-in'); return false }
    }
    if (step === 2) {
      if (Number(form.amount_to_pay) < 0) { toast.error('Payment cannot be negative'); return false }
      if (Number(form.amount_to_pay) > totalAmount) { toast.error('Payment cannot exceed total amount'); return false }
    }
    return true
  }

  function next() { if (validateStep()) setStep(s => Math.min(s + 1, 3)) }
  function back() { setStep(s => Math.max(s - 1, 0)) }

  async function getNextSequence(table) {
    const year = new Date().getFullYear()
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`)
    return (count || 0) + 1
  }

  async function handleConfirm() {
    if (!validateStep()) return
    setSaving(true)

    // Check for overlapping bookings
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('apartment_id', form.apartment_id)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', form.check_out_date)
      .gt('check_out_date', form.check_in_date)

    if (conflicts && conflicts.length > 0) {
      toast.error('This apartment is already booked for those dates. Please choose different dates or another apartment.')
      setSaving(false)
      return
    }

    const bookingSeq = await getNextSequence('bookings', 'booking_reference')
    const bookingRef = generateBookingRef(bookingSeq)

    // Upsert client
    let clientId
    const { data: existingClient } = await supabase
      .from('clients').select('id').eq('phone', form.phone).maybeSingle()

    if (existingClient) {
      clientId = existingClient.id
    } else {
      const { data: newClient, error: clientErr } = await supabase.from('clients').insert({
        full_name: form.full_name,
        nrc_or_passport: form.nrc_or_passport || null,
        phone: form.phone,
        email: form.email || null,
        company: form.company || null,
      }).select('id').single()
      if (clientErr) { toast.error('Failed to save client'); setSaving(false); return }
      clientId = newClient.id
    }

    const amountPaid = Number(form.amount_to_pay) || 0
    const paymentStatus = getPaymentStatus(totalAmount, amountPaid)

    const { data: booking, error: bookErr } = await supabase.from('bookings').insert({
      booking_reference: bookingRef,
      client_id: clientId,
      apartment_id: form.apartment_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      number_of_days: days,
      rate_per_day: Number(form.rate_per_day),
      total_amount: totalAmount,
      amount_paid: amountPaid,
      outstanding_balance: totalAmount - amountPaid,
      payment_status: paymentStatus,
      booking_status: 'confirmed',
      notes: form.notes || null,
      created_by: user?.id,
    }).select('id').single()

    if (bookErr) { toast.error('Failed to create booking'); setSaving(false); return }

    // Record payment if amount > 0
    if (amountPaid > 0) {
      const receiptSeq = await getNextSequence('payments', 'receipt_number')
      const receiptNum = generateReceiptNumber(receiptSeq)
      await supabase.from('payments').insert({
        booking_id: booking.id,
        client_id: clientId,
        amount: amountPaid,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: form.payment_method,
        receipt_number: receiptNum,
        recorded_by: user?.id,
      })
      const apt = apartments.find(a => a.id === form.apartment_id)
      downloadReceipt({
        receiptNumber: receiptNum,
        paymentDate: new Date().toISOString().split('T')[0],
        clientName: form.full_name,
        clientPhone: form.phone,
        clientNRC: form.nrc_or_passport || null,
        apartmentNumber: apt?.apartment_number,
        location: locations.find(l => l.id === form.location_id)?.name,
        checkIn: form.check_in_date,
        checkOut: form.check_out_date,
        numberOfDays: days,
        ratePerDay: Number(form.rate_per_day),
        totalAmount,
        amountPaid,
        outstandingBalance: totalAmount - amountPaid,
        paymentMethod: form.payment_method,
        staffName: user?.email,
        bookingRef,
      })
    }

    toast.success(`Booking ${bookingRef} created!`)
    navigate(`/bookings/${booking.id}`)
  }

  const selectedApt = apartments.find(a => a.id === form.apartment_id)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => navigate('/bookings')} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">New Booking</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-[#1e3a5f] text-white' : 'bg-gray-200 text-gray-400'}`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <span className={`ml-1 text-xs hidden sm:block ${i === step ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 0: Client */}
      {step === 0 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Client Details</h2>
            <div>
              <Label>Full Name *</Label>
              <Input placeholder="John Banda" {...field('full_name')} />
            </div>
            <div>
              <Label>Phone Number *</Label>
              <Input type="tel" placeholder="+260 97 000 0000" {...field('phone')} />
            </div>
            <div>
              <Label>NRC / Passport</Label>
              <Input placeholder="123456/10/1" {...field('nrc_or_passport')} />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input type="email" placeholder="client@example.com" {...field('email')} />
            </div>
            <div>
              <Label>Company (optional)</Label>
              <Input placeholder="ABC Ltd" {...field('company')} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Apartment */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Apartment & Dates</h2>
            <div>
              <Label>Location *</Label>
              <Select {...field('location_id')} disabled={isRestricted}>
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Apartment *</Label>
              <Select {...field('apartment_id')} disabled={!form.location_id}>
                <option value="">Select apartment…</option>
                {apartments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.apartment_number} — {a.type} ({formatCurrency(a.daily_rate)}/day)
                  </option>
                ))}
              </Select>
              {form.location_id && apartments.length === 0 && (
                <p className="text-xs text-red-500 mt-1">No available apartments at this location</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Check-in *</Label>
                <Input type="date" {...field('check_in_date')} />
              </div>
              <div>
                <Label>Check-out *</Label>
                <Input type="date" {...field('check_out_date')} />
              </div>
            </div>
            {form.apartment_id && (
              <div>
                <Label>Rate per Day (ZMW)</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" {...field('rate_per_day')} />
                <p className="text-xs text-gray-400 mt-1">Pre-filled from apartment — edit to override</p>
              </div>
            )}
            {days > 0 && (
              <div className="bg-blue-50 rounded-xl p-3 text-sm">
                <p className="text-blue-700"><strong>{days} nights</strong> × {formatCurrency(form.rate_per_day)}/day = <strong>{formatCurrency(totalAmount)}</strong></p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Payment */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Initial Payment</h2>
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Total amount</span><strong>{formatCurrency(totalAmount)}</strong></div>
            </div>
            <div>
              <Label>Amount to Pay Now</Label>
              <Input type="number" placeholder="0.00" min="0" max={totalAmount} {...field('amount_to_pay')} />
              <p className="text-xs text-gray-400 mt-1">Leave 0 to record as unpaid</p>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select {...field('payment_method')}>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input placeholder="Any notes…" {...field('notes')} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Booking Summary</h2>
            <div className="space-y-2 text-sm">
              <Row label="Client" value={form.full_name} />
              <Row label="Phone" value={form.phone} />
              {form.nrc_or_passport && <Row label="NRC/Passport" value={form.nrc_or_passport} />}
              <div className="border-t border-gray-100 my-2" />
              <Row label="Apartment" value={selectedApt ? `${selectedApt.apartment_number} (${selectedApt.type})` : '—'} />
              <Row label="Location" value={locations.find(l => l.id === form.location_id)?.name} />
              <Row label="Check-in" value={form.check_in_date} />
              <Row label="Check-out" value={form.check_out_date} />
              <Row label="Nights" value={days} />
              <Row label="Rate/Day" value={formatCurrency(form.rate_per_day)} />
              <div className="border-t border-gray-100 my-2" />
              <Row label="Total Amount" value={formatCurrency(totalAmount)} bold />
              <Row label="Paying Now" value={formatCurrency(Number(form.amount_to_pay) || 0)} />
              <Row label="Balance Due" value={formatCurrency(outstandingBalance)} bold={outstandingBalance > 0} />
              {Number(form.amount_to_pay) > 0 && <Row label="Payment Method" value={form.payment_method?.replace('_', ' ')} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nav buttons */}
      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" className="flex-1" onClick={back}>
            <ChevronLeft size={16} /> Back
          </Button>
        )}
        {step < 3 ? (
          <Button className="flex-1" onClick={next}>
            Next <ChevronRight size={16} />
          </Button>
        ) : (
          <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Creating…' : 'Confirm Booking'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value ?? '—'}</span>
    </div>
  )
}
