import { useState, useEffect, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Label } from '@/shared/ui/Label'
import { Select } from '@/shared/ui/Select'
import { Card, CardContent } from '@/shared/ui/Card'
import { formatCurrency, calcDays, calcTotal } from '@/shared/lib/bookingUtils'
import { downloadReceipt } from '@/shared/lib/receiptGenerator'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { APARTMENT_STATUS, PAYMENT_METHOD, PAYMENT_METHOD_OPTIONS } from '@/shared/constants/status'
import { listApartments, type Apartment } from '@/features/apartments/api'
import { listLocations, type Location } from '@/features/locations/api'
import { recordPayment } from '@/features/payments/api'
import { createBooking, hasOverlappingBooking } from '../api'
import { validateApartmentStep, validateClientStep, validateInitialPayment } from '../validators'

const STEPS = ['Client', 'Apartment', 'Payment', 'Confirm']

interface NewBookingFormState {
  full_name: string
  nrc_or_passport: string
  phone: string
  email: string
  company: string
  location_id: string
  apartment_id: string
  check_in_date: string
  check_out_date: string
  rate_per_day: string
  amount_to_pay: string
  payment_method: string
  notes: string
}

const EMPTY: NewBookingFormState = {
  full_name: '', nrc_or_passport: '', phone: '', email: '', company: '',
  location_id: '', apartment_id: '', check_in_date: '', check_out_date: '',
  rate_per_day: '', amount_to_pay: '', payment_method: PAYMENT_METHOD.CASH, notes: '',
}

export default function NewBookingPage() {
  const { user, isRestricted, locationId } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<NewBookingFormState>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<Location[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [saving, setSaving] = useState(false)

  const days = calcDays(form.check_in_date, form.check_out_date)
  const totalAmount = calcTotal(days, Number(form.rate_per_day) || 0)
  const outstandingBalance = totalAmount - (Number(form.amount_to_pay) || 0)

  useEffect(() => {
    listLocations().then(allLocations => {
      const scoped = isRestricted && locationId ? allLocations.filter(l => l.id === locationId) : allLocations
      setLocations(scoped)
      if (isRestricted && locationId) set('location_id', locationId)
    })
  }, [isRestricted, locationId])

  useEffect(() => {
    const apartmentsForLocation = form.location_id
      ? listApartments({ locationId: form.location_id, status: APARTMENT_STATUS.AVAILABLE })
      : Promise.resolve([])
    apartmentsForLocation.then(setApartments)
  }, [form.location_id])

  useEffect(() => {
    if (!form.apartment_id) return
    const apt = apartments.find(a => a.id === form.apartment_id)
    if (apt) set('rate_per_day', String(apt.daily_rate))
  }, [form.apartment_id, apartments])

  function set(key: keyof NewBookingFormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function field(key: keyof NewBookingFormState) {
    return { value: form[key], onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(key, e.target.value) }
  }

  function validateStep(): boolean {
    if (step === 0) {
      const result = validateClientStep(form)
      setErrors(result.errors)
      if (!result.valid) toast.error('Name and phone are required')
      return result.valid
    }
    if (step === 1) {
      const result = validateApartmentStep(form)
      setErrors(result.errors)
      if (!result.valid) toast.error(Object.values(result.errors)[0])
      return result.valid
    }
    if (step === 2) {
      const result = validateInitialPayment(form.amount_to_pay, totalAmount)
      if (!result.valid) toast.error(result.error ?? 'Invalid amount')
      return result.valid
    }
    return true
  }

  function next() { if (validateStep()) setStep(s => Math.min(s + 1, 3)) }
  function back() { setStep(s => Math.max(s - 1, 0)) }

  async function handleConfirm() {
    if (!validateStep()) return
    setSaving(true)

    const overlapping = await hasOverlappingBooking(form.apartment_id, form.check_in_date, form.check_out_date)
    if (overlapping) {
      toast.error('This apartment is already booked for those dates. Please choose different dates or another apartment.')
      setSaving(false)
      return
    }

    const amountPaid = Number(form.amount_to_pay) || 0

    let booking
    try {
      booking = await createBooking({
        client: {
          full_name: form.full_name,
          phone: form.phone,
          nrc_or_passport: form.nrc_or_passport,
          email: form.email,
          company: form.company,
        },
        apartmentId: form.apartment_id,
        checkInDate: form.check_in_date,
        checkOutDate: form.check_out_date,
        ratePerDay: Number(form.rate_per_day),
        totalAmount,
        notes: form.notes,
        createdBy: user?.id,
      })
    } catch (err) {
      setSaving(false)
      toast.error(err instanceof Error ? err.message : String(err))
      return
    }

    if (amountPaid > 0) {
      try {
        const payment = await recordPayment({
          bookingId: booking.bookingId,
          amount: amountPaid,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: form.payment_method,
        })
        const apt = apartments.find(a => a.id === form.apartment_id)
        downloadReceipt({
          receiptNumber: payment.receipt_number,
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
          bookingRef: booking.bookingRef,
        })
      } catch {
        // The booking itself was created; only the payment failed. Route the
        // user there instead of leaving them on a form with no way back to it.
        setSaving(false)
        toast.error('Booking created but payment failed. Please record the payment from the booking page.')
        navigate(`/bookings/${booking.bookingId}`)
        return
      }
    }

    setSaving(false)
    toast.success(`Booking ${booking.bookingRef} created!`)
    navigate(`/bookings/${booking.bookingId}`)
  }

  const selectedApt = apartments.find(a => a.id === form.apartment_id)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => navigate('/bookings')} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">New Booking</h1>
      </div>

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

      {step === 0 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Client Details</h2>
            <div>
              <Label htmlFor="nb-full-name">Full Name *</Label>
              <Input id="nb-full-name" placeholder="John Banda" {...field('full_name')} aria-invalid={!!errors.full_name} />
              {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
            </div>
            <div>
              <Label htmlFor="nb-phone">Phone Number *</Label>
              <Input id="nb-phone" type="tel" placeholder="+260 97 000 0000" {...field('phone')} aria-invalid={!!errors.phone} />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="nb-nrc">NRC / Passport</Label>
              <Input id="nb-nrc" placeholder="123456/10/1" {...field('nrc_or_passport')} />
            </div>
            <div>
              <Label htmlFor="nb-email">Email (optional)</Label>
              <Input id="nb-email" type="email" placeholder="client@example.com" {...field('email')} />
            </div>
            <div>
              <Label htmlFor="nb-company">Company (optional)</Label>
              <Input id="nb-company" placeholder="ABC Ltd" {...field('company')} />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Apartment & Dates</h2>
            <div>
              <Label htmlFor="nb-location">Location *</Label>
              <Select id="nb-location" {...field('location_id')} disabled={isRestricted} aria-invalid={!!errors.location_id}>
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="nb-apartment">Apartment *</Label>
              <Select id="nb-apartment" {...field('apartment_id')} disabled={!form.location_id} aria-invalid={!!errors.apartment_id}>
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
                <Label htmlFor="nb-checkin">Check-in *</Label>
                <Input id="nb-checkin" type="date" {...field('check_in_date')} aria-invalid={!!errors.check_in_date} />
              </div>
              <div>
                <Label htmlFor="nb-checkout">Check-out *</Label>
                <Input id="nb-checkout" type="date" {...field('check_out_date')} aria-invalid={!!errors.check_out_date} />
                {errors.check_out_date && <p className="text-xs text-red-500 mt-1">{errors.check_out_date}</p>}
              </div>
            </div>
            {form.apartment_id && (
              <div>
                <Label htmlFor="nb-rate">Rate per Day (ZMW)</Label>
                <Input id="nb-rate" type="number" min="0" step="0.01" placeholder="0.00" {...field('rate_per_day')} />
                <p className="text-xs text-gray-400 mt-1">Pre-filled from apartment — edit to override</p>
              </div>
            )}
            {days > 0 && (
              <div className="bg-blue-50 rounded-xl p-3 text-sm">
                <p className="text-blue-700"><strong>{days} nights</strong> × {formatCurrency(Number(form.rate_per_day))}/day = <strong>{formatCurrency(totalAmount)}</strong></p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Initial Payment</h2>
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Total amount</span><strong>{formatCurrency(totalAmount)}</strong></div>
            </div>
            <div>
              <Label htmlFor="nb-amount-to-pay">Amount to Pay Now</Label>
              <Input id="nb-amount-to-pay" type="number" placeholder="0.00" min="0" max={totalAmount} {...field('amount_to_pay')} />
              <p className="text-xs text-gray-400 mt-1">Leave 0 to record as unpaid</p>
            </div>
            <div>
              <Label htmlFor="nb-payment-method">Payment Method</Label>
              <Select id="nb-payment-method" {...field('payment_method')}>
                {PAYMENT_METHOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="nb-notes">Notes (optional)</Label>
              <Input id="nb-notes" placeholder="Any notes…" {...field('notes')} />
            </div>
          </CardContent>
        </Card>
      )}

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
              <Row label="Rate/Day" value={formatCurrency(Number(form.rate_per_day))} />
              <div className="border-t border-gray-100 my-2" />
              <Row label="Total Amount" value={formatCurrency(totalAmount)} bold />
              <Row label="Paying Now" value={formatCurrency(Number(form.amount_to_pay) || 0)} />
              <Row label="Balance Due" value={formatCurrency(outstandingBalance)} bold={outstandingBalance > 0} />
              {Number(form.amount_to_pay) > 0 && <Row label="Payment Method" value={form.payment_method?.replace('_', ' ')} />}
            </div>
          </CardContent>
        </Card>
      )}

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

function Row({ label, value, bold }: { label: string; value?: string | number | null; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value ?? '—'}</span>
    </div>
  )
}
