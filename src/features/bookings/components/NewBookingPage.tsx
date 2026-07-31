import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Label } from '@/shared/ui/Label'
import { Select } from '@/shared/ui/Select'
import { Card, CardContent } from '@/shared/ui/Card'
import { formatCurrency, calcDays, calcTotal, todayLocalISO, perNightForMode, eligibleRateModes, roundKwacha, type RateMode } from '@/shared/lib/bookingUtils'
import { getErrorMessage } from '@/shared/lib/utils'
import { downloadReceipt } from '@/shared/lib/receiptLazy'
import { ChevronLeft, ChevronRight, Check, Plus, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { PAYMENT_METHOD, PAYMENT_METHOD_OPTIONS } from '@/shared/constants/status'
import { listAvailableApartmentsForDates, type Apartment } from '@/features/apartments/api'
import { listLocations, type Location } from '@/features/locations/api'
import { searchClients, type Client } from '@/features/clients/api'
import { recordPayment } from '@/features/payments/api'
import { createBooking } from '../api'
import { validateClientStep, validateInitialPayment } from '../validators'

const STEPS = ['Client', 'Rooms', 'Payment', 'Confirm']

interface RoomEntry {
  apartment_id: string
  apartment_number: string
  check_in_date: string
  check_out_date: string
  rate_per_day: number
}

interface ClientState {
  full_name: string
  nrc_or_passport: string
  phone: string
  email: string
  company: string
}

const EMPTY_CLIENT: ClientState = { full_name: '', nrc_or_passport: '', phone: '', email: '', company: '' }
const EMPTY_DRAFT = { apartment_id: '', check_in_date: '', check_out_date: '', rate_per_day: '' }

export default function NewBookingPage() {
  const { user, isRestricted, locationId } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const [client, setClient] = useState<ClientState>(EMPTY_CLIENT)
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  // Existing-client search: when a result is picked we keep its id so the
  // booking links straight to that client; editing any field clears it.
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const [locationIdSel, setLocationIdSel] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  // The location|checkIn|checkOut key that `apartments` currently reflects,
  // set only inside the availability effect's .then() (never synchronously),
  // so "still checking" can be derived by comparing it to the requested key
  // instead of tracked with an imperative loading flag.
  const [lastCheckedRange, setLastCheckedRange] = useState<string | null>(null)
  const [rooms, setRooms] = useState<RoomEntry[]>([])
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  const [amountToPay, setAmountToPay] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHOD.CASH)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const totalAmount = rooms.reduce((sum, r) => sum + calcTotal(calcDays(r.check_in_date, r.check_out_date), r.rate_per_day), 0)
  const outstandingBalance = totalAmount - (Number(amountToPay) || 0)

  useEffect(() => {
    listLocations().then(all => {
      const scoped = isRestricted && locationId ? all.filter(l => l.id === locationId) : all
      setLocations(scoped)
      if (isRestricted && locationId) setLocationIdSel(locationId)
    })
  }, [isRestricted, locationId])

  // Tracks the range the in-flight lookup was FOR, mutated synchronously
  // (a ref, not state, so it's fine inside an effect) purely so a
  // late-resolving older lookup can tell it's been superseded and skip
  // overwriting a newer result.
  const latestRangeRef = useRef<string | null>(null)

  // Apartments are looked up for the exact dates being entered, not by their
  // current static status — an apartment occupied today can still be free for
  // a future date range once its current guest checks out. Only fires once
  // both dates are filled in and check-out is after check-in; both state
  // writes happen inside .then()/.catch(), never synchronously in the effect
  // body, so "still checking" (below) has to be derived rather than flagged.
  useEffect(() => {
    const ready = !!locationIdSel && !!draft.check_in_date && !!draft.check_out_date && draft.check_out_date > draft.check_in_date
    if (!ready) return

    const range = `${locationIdSel}|${draft.check_in_date}|${draft.check_out_date}`
    latestRangeRef.current = range
    listAvailableApartmentsForDates(locationIdSel, draft.check_in_date, draft.check_out_date)
      .then(result => {
        if (latestRangeRef.current !== range) return
        setApartments(result)
        setLastCheckedRange(range)
      })
      .catch(() => {
        if (latestRangeRef.current !== range) return
        toast.error('Could not check apartment availability')
      })
  }, [locationIdSel, draft.check_in_date, draft.check_out_date])

  // Selecting an apartment also prefills the draft rate from its daily rate
  // (rounded — whole-kwacha policy, in case an old stored rate has ngwee).
  function selectDraftApartment(apartmentId: string) {
    const apt = apartments.find(a => a.id === apartmentId)
    setDraft(d => ({ ...d, apartment_id: apartmentId, rate_per_day: apt ? String(roundKwacha(apt.daily_rate)) : '' }))
  }

  // Picking Daily/Weekly/Monthly just rewrites the per-night rate; the total
  // and everything downstream stay driven by rate_per_day × nights.
  function selectRateMode(mode: RateMode) {
    const apt = apartments.find(a => a.id === draft.apartment_id)
    if (!apt) return
    setDraft(d => ({ ...d, rate_per_day: String(perNightForMode(apt, mode)) }))
  }

  const datesReady = !!draft.check_in_date && !!draft.check_out_date && draft.check_out_date > draft.check_in_date
  const currentRange = datesReady ? `${locationIdSel}|${draft.check_in_date}|${draft.check_out_date}` : null
  // True whenever the requested range hasn't been fetched yet — including the
  // instant dates become ready, before the effect's promise has resolved.
  const checkingAvailability = datesReady && lastCheckedRange !== currentRange
  // Free-for-these-dates apartments not already added to this booking. Empty
  // whenever dates aren't ready or the fetch for them hasn't landed yet —
  // regardless of whatever `apartments` still holds from a previous lookup.
  const availableApartments = (datesReady && !checkingAvailability)
    ? apartments.filter(a => !rooms.some(r => r.apartment_id === a.id))
    : []

  // Weekly/monthly discount options for the room being drafted — only the tiers
  // that make sense for its length of stay and that this apartment has a rate
  // for. Shown as a chooser only when there's more than just "daily".
  const draftNights = calcDays(draft.check_in_date, draft.check_out_date)
  const draftApt = apartments.find(a => a.id === draft.apartment_id)
  const rateModes = draftApt ? eligibleRateModes(draftApt, draftNights) : []

  function clientField(key: keyof ClientState) {
    return {
      value: client[key],
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        // Manually editing a field means it's no longer the picked client.
        setSelectedClientId(null)
        setClient(c => ({ ...c, [key]: e.target.value }))
      },
    }
  }

  async function onClientSearch(value: string) {
    setClientSearch(value)
    const term = value.trim()
    if (term.length < 2) { setClientResults([]); return }
    try { setClientResults(await searchClients(term)) } catch { /* ignore search errors */ }
  }

  function pickClient(c: Client) {
    setClient({
      full_name: c.full_name ?? '',
      phone: c.phone ?? '',
      nrc_or_passport: c.nrc_or_passport ?? '',
      email: c.email ?? '',
      company: c.company ?? '',
    })
    setSelectedClientId(c.id)
    setClientSearch('')
    setClientResults([])
  }

  // A complete, valid room from the current draft, or null if the draft isn't
  // finished. Lets Next fold in a single room without an explicit "Add Room" tap.
  function buildDraftRoom(): RoomEntry | null {
    const apt = apartments.find(a => a.id === draft.apartment_id)
    if (!apt) return null
    if (!draft.check_in_date || !draft.check_out_date) return null
    if (draft.check_out_date <= draft.check_in_date) return null
    // Whole-kwacha policy: a hand-typed decimal rate is rounded on the way in.
    const rate = roundKwacha(Number(draft.rate_per_day))
    if (!rate || rate <= 0) return null
    return {
      apartment_id: apt.id,
      apartment_number: apt.apartment_number,
      check_in_date: draft.check_in_date,
      check_out_date: draft.check_out_date,
      rate_per_day: rate,
    }
  }

  function addRoom() {
    if (!draft.apartment_id) { toast.error('Select an apartment'); return }
    if (!draft.check_in_date || !draft.check_out_date) { toast.error('Enter check-in and check-out dates'); return }
    if (draft.check_out_date <= draft.check_in_date) { toast.error('Check-out must be after check-in'); return }
    if (!Number(draft.rate_per_day) || Number(draft.rate_per_day) <= 0) { toast.error('Rate per day must be greater than 0'); return }

    const room = buildDraftRoom()
    if (room) { setRooms(rs => [...rs, room]); setDraft(EMPTY_DRAFT) }
  }

  function removeRoom(apartmentId: string) {
    setRooms(rs => rs.filter(r => r.apartment_id !== apartmentId))
  }

  function validateStep(): boolean {
    if (step === 0) {
      const result = validateClientStep(client)
      setClientErrors(result.errors)
      if (!result.valid) toast.error('Name and phone are required')
      return result.valid
    }
    if (step === 1) {
      // Fold in a completed room the user filled but didn't explicitly "Add",
      // so a single-apartment booking doesn't need the extra tap.
      const draftRoom = buildDraftRoom()
      if (rooms.length === 0 && !draftRoom) {
        toast.error(draft.apartment_id ? 'Finish the room’s dates and rate first' : 'Add at least one room')
        return false
      }
      if (draftRoom) {
        setRooms(rs => rs.some(r => r.apartment_id === draftRoom.apartment_id) ? rs : [...rs, draftRoom])
        setDraft(EMPTY_DRAFT)
      }
      return true
    }
    if (step === 2) {
      const result = validateInitialPayment(amountToPay, totalAmount)
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

    const amountPaid = Number(amountToPay) || 0

    let booking
    try {
      booking = await createBooking({
        client: {
          full_name: client.full_name,
          phone: client.phone,
          nrc_or_passport: client.nrc_or_passport,
          email: client.email,
          company: client.company,
        },
        clientId: selectedClientId,
        rooms: rooms.map(r => ({
          apartmentId: r.apartment_id,
          checkInDate: r.check_in_date,
          checkOutDate: r.check_out_date,
          ratePerDay: r.rate_per_day,
        })),
        notes,
      })
    } catch (err) {
      setSaving(false)
      toast.error(getErrorMessage(err))
      return
    }

    if (amountPaid > 0) {
      try {
        const payment = await recordPayment({
          bookingId: booking.bookingId,
          amount: amountPaid,
          paymentDate: todayLocalISO(),
          paymentMethod,
        })
        await downloadReceipt({
          receiptNumber: payment.receipt_number,
          paymentDate: todayLocalISO(),
          clientName: client.full_name,
          clientPhone: client.phone,
          clientNRC: client.nrc_or_passport || null,
          location: locations.find(l => l.id === locationIdSel)?.name,
          rooms: rooms.map(r => ({
            apartmentNumber: r.apartment_number,
            checkIn: r.check_in_date,
            checkOut: r.check_out_date,
            numberOfDays: calcDays(r.check_in_date, r.check_out_date),
            ratePerDay: r.rate_per_day,
            lineTotal: calcTotal(calcDays(r.check_in_date, r.check_out_date), r.rate_per_day),
          })),
          totalAmount,
          amountPaid,
          outstandingBalance: totalAmount - amountPaid,
          paymentMethod,
          staffName: user?.email,
          bookingRef: booking.bookingRef,
        })
      } catch {
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
            <div className="relative">
              <Label htmlFor="nb-client-search" className="sr-only">Search existing clients</Label>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input id="nb-client-search" className="pl-9" placeholder="Search existing client by name or phone…"
                value={clientSearch} onChange={e => onClientSearch(e.target.value)} />
              {clientResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  {clientResults.map(c => (
                    <button key={c.id} type="button" onClick={() => pickClient(c)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-800">{c.full_name}</span>
                      <span className="text-gray-400"> · {c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedClientId && (
              <p className="text-xs text-green-600">Using an existing client — edit any field to book a new one instead.</p>
            )}
            <div>
              <Label htmlFor="nb-full-name">Full Name *</Label>
              <Input id="nb-full-name" placeholder="John Banda" {...clientField('full_name')} aria-invalid={!!clientErrors.full_name} />
              {clientErrors.full_name && <p className="text-xs text-red-500 mt-1">{clientErrors.full_name}</p>}
            </div>
            <div>
              <Label htmlFor="nb-phone">Phone Number *</Label>
              <Input id="nb-phone" type="tel" placeholder="+260 97 000 0000" {...clientField('phone')} aria-invalid={!!clientErrors.phone} />
              {clientErrors.phone && <p className="text-xs text-red-500 mt-1">{clientErrors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="nb-nrc">NRC / Passport</Label>
              <Input id="nb-nrc" placeholder="123456/10/1" {...clientField('nrc_or_passport')} />
            </div>
            <div>
              <Label htmlFor="nb-email">Email (optional)</Label>
              <Input id="nb-email" type="email" placeholder="client@example.com" {...clientField('email')} />
            </div>
            <div>
              <Label htmlFor="nb-company">Company (optional)</Label>
              <Input id="nb-company" placeholder="ABC Ltd" {...clientField('company')} />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Rooms</h2>
            <div>
              <Label htmlFor="nb-location">Location *</Label>
              <Select id="nb-location" value={locationIdSel} onChange={e => { setLocationIdSel(e.target.value); setRooms([]); setDraft(EMPTY_DRAFT) }} disabled={isRestricted}>
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>

            {rooms.length > 0 && (
              <div className="space-y-2">
                {rooms.map(r => {
                  const nights = calcDays(r.check_in_date, r.check_out_date)
                  return (
                    <div key={r.apartment_id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm">
                      <div>
                        <p className="font-semibold text-gray-800">{r.apartment_number}</p>
                        <p className="text-xs text-gray-500">{r.check_in_date} → {r.check_out_date} · {nights} nights · {formatCurrency(r.rate_per_day)}/night</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{formatCurrency(calcTotal(nights, r.rate_per_day))}</span>
                        <button onClick={() => removeRoom(r.apartment_id)} aria-label={`Remove ${r.apartment_number}`} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-500">{rooms.length} room{rooms.length > 1 ? 's' : ''}</span>
                  <strong>{formatCurrency(totalAmount)}</strong>
                </div>
              </div>
            )}

            {locationIdSel && (
              <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add a room</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="nb-checkin">Check-in</Label>
                    <Input id="nb-checkin" type="date" value={draft.check_in_date}
                      onChange={e => setDraft(d => ({ ...d, check_in_date: e.target.value, apartment_id: '', rate_per_day: '' }))} />
                  </div>
                  <div>
                    <Label htmlFor="nb-checkout">Check-out</Label>
                    <Input id="nb-checkout" type="date" value={draft.check_out_date}
                      onChange={e => setDraft(d => ({ ...d, check_out_date: e.target.value, apartment_id: '', rate_per_day: '' }))} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="nb-apartment">Apartment</Label>
                  <Select id="nb-apartment" value={draft.apartment_id} onChange={e => selectDraftApartment(e.target.value)} disabled={!datesReady || checkingAvailability}>
                    <option value="">
                      {!datesReady ? 'Enter dates first…' : checkingAvailability ? 'Checking availability…' : 'Select apartment…'}
                    </option>
                    {availableApartments.map(a => (
                      <option key={a.id} value={a.id}>{a.apartment_number} — {a.type} ({formatCurrency(a.daily_rate)}/day)</option>
                    ))}
                  </Select>
                  {!datesReady && (
                    <p className="text-xs text-gray-400 mt-1">Enter check-in and check-out dates to see which apartments are free.</p>
                  )}
                  {datesReady && !checkingAvailability && availableApartments.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">No apartments free at this location for those dates.</p>
                  )}
                </div>
                {draft.apartment_id && draftApt && rateModes.length > 1 && (
                  <div>
                    <Label>Rate</Label>
                    <div className="grid gap-2">
                      {rateModes.map(mode => {
                        const perNight = perNightForMode(draftApt, mode)
                        const active = Math.abs(Number(draft.rate_per_day) - perNight) < 0.005
                        const meta = rateModeMeta(draftApt, mode)
                        return (
                          <button key={mode} type="button" onClick={() => selectRateMode(mode)}
                            className={`flex items-center justify-between rounded-xl border p-3 text-sm text-left transition-colors ${active ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                            <span>
                              <span className="font-semibold text-gray-800">{meta.label}</span>
                              <span className="text-gray-400"> · {meta.from}</span>
                            </span>
                            <span className="text-right">
                              <span className="block font-semibold text-gray-900">{formatCurrency(calcTotal(draftNights, perNight))}</span>
                              <span className="block text-xs text-gray-500">{formatCurrency(perNight)}/night</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Longer-stay discount — pick a rate, or type your own below.</p>
                  </div>
                )}
                {draft.apartment_id && (
                  <div>
                    <Label htmlFor="nb-rate">Rate per Day (ZMW)</Label>
                    <Input id="nb-rate" type="number" min="0" step="1" value={draft.rate_per_day} onChange={e => setDraft(d => ({ ...d, rate_per_day: e.target.value }))} />
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={addRoom} disabled={!draft.apartment_id}>
                  <Plus size={16} /> Add Room
                </Button>
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
              <Input id="nb-amount-to-pay" type="number" placeholder="0.00" min="0" max={totalAmount} value={amountToPay} onChange={e => setAmountToPay(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Leave 0 to record as unpaid</p>
            </div>
            <div>
              <Label htmlFor="nb-payment-method">Payment Method</Label>
              <Select id="nb-payment-method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="nb-notes">Notes (optional)</Label>
              <Input id="nb-notes" placeholder="Any notes…" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold text-gray-800">Booking Summary</h2>
            <div className="space-y-2 text-sm">
              <Row label="Client" value={client.full_name} />
              <Row label="Phone" value={client.phone} />
              {client.nrc_or_passport && <Row label="NRC/Passport" value={client.nrc_or_passport} />}
              <Row label="Location" value={locations.find(l => l.id === locationIdSel)?.name} />
              <div className="border-t border-gray-100 my-2" />
              {rooms.map(r => {
                const nights = calcDays(r.check_in_date, r.check_out_date)
                return (
                  <div key={r.apartment_id} className="flex justify-between">
                    <span className="text-gray-500">{r.apartment_number} · {r.check_in_date}→{r.check_out_date} ({nights}n)</span>
                    <span className="text-gray-700">{formatCurrency(calcTotal(nights, r.rate_per_day))}</span>
                  </div>
                )
              })}
              <div className="border-t border-gray-100 my-2" />
              <Row label="Total Amount" value={formatCurrency(totalAmount)} bold />
              <Row label="Paying Now" value={formatCurrency(Number(amountToPay) || 0)} />
              <Row label="Balance Due" value={formatCurrency(outstandingBalance)} bold={outstandingBalance > 0} />
              {Number(amountToPay) > 0 && <Row label="Payment Method" value={paymentMethod?.replace('_', ' ')} />}
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

// Label + "from" hint for a rate tier button, e.g. Weekly · from K7,000/week.
function rateModeMeta(apt: Apartment, mode: RateMode): { label: string; from: string } {
  if (mode === 'weekly') return { label: 'Weekly', from: `from ${formatCurrency(apt.weekly_rate)}/week` }
  if (mode === 'monthly') return { label: 'Monthly', from: `from ${formatCurrency(apt.monthly_rate)}/month` }
  return { label: 'Daily', from: `${formatCurrency(apt.daily_rate)}/night` }
}

function Row({ label, value, bold }: { label: string; value?: string | number | null; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value ?? '—'}</span>
    </div>
  )
}
