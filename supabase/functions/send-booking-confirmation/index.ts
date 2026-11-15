// send-booking-confirmation
//
// Sends a booking confirmation to the client by email (Resend) and WhatsApp
// (Meta WhatsApp Business Cloud API), and records every attempt in
// booking_notifications.
//
// Called by the app right after a booking is created, and again from the
// booking page's "Resend" buttons:
//   POST { booking_id: uuid, channels?: ('email' | 'whatsapp')[] }
//
// Security model:
//   * The caller must be a signed-in staff member. The booking is read with
//     the CALLER's token, so row-level security decides whether they may see
//     it — an employee cannot trigger a message for another location's
//     booking, and a booking ID that isn't visible to them looks "not found".
//   * Everything in the message comes from the database, never from the
//     request body, so a caller cannot make the business send arbitrary text.
//   * The provider keys live only in Edge Function secrets.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY              Resend API key
//   EMAIL_FROM                  e.g. "VK Luxurious Apartments <bookings@vkbooking.com>"
//   WHATSAPP_ACCESS_TOKEN       permanent System User token
//   WHATSAPP_PHONE_NUMBER_ID    the sending number's ID (not the number itself)
//   WHATSAPP_TEMPLATE_NAME      default "booking_confirmation"
//   WHATSAPP_TEMPLATE_LANG      default "en"
// A channel whose secrets are missing is recorded as "skipped", so this can be
// deployed before the provider accounts are ready.

import { createClient } from 'jsr:@supabase/supabase-js@2'

type Channel = 'email' | 'whatsapp'
type Status = 'sent' | 'failed' | 'skipped'

interface Outcome {
  channel: Channel
  status: Status
  recipient: string | null
  provider_message_id?: string | null
  error?: string | null
}

interface Room {
  check_in_date: string
  check_out_date: string
  rate_per_day: number
  status: string
  apartment: { apartment_number: string; location: { name: string } | null } | null
}

interface BookingRow {
  id: string
  booking_reference: string
  check_in_date: string | null
  check_out_date: string | null
  total_amount: number
  amount_paid: number
  outstanding_balance: number
  booking_status: string
  client: { full_name: string; phone: string | null; email: string | null } | null
  rooms: Room[]
}

const ALLOWED_ORIGINS = ['https://vkbooking.com', 'http://localhost:5173']

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-11-15" -> "15 Nov 2026". Parsed by hand: dates here are calendar
// dates with no timezone, and `new Date('2026-11-15')` would read as UTC.
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

export function formatMoney(amount: number | null): string {
  const n = Number(amount ?? 0)
  return `K${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// WhatsApp needs the full international number, digits only. Staff type
// Zambian numbers as 0977123456, 977123456, +260977123456 or 260 97 712 3456.
// Anything that already carries another country code is passed through.
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10 && digits.startsWith('0')) return `260${digits.slice(1)}`
  if (digits.length === 9) return `260${digits}`
  if (digits.length >= 11 && digits.length <= 15) return digits
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function liveRooms(b: BookingRow): Room[] {
  const rooms = b.rooms.filter((r) => r.status !== 'cancelled')
  return rooms.sort((a, c) => a.check_in_date.localeCompare(c.check_in_date))
}

// "Apt 4, Apt 7 — Nkana East"
export function describeApartments(b: BookingRow): string {
  const rooms = liveRooms(b)
  const numbers = [...new Set(rooms.map((r) => r.apartment?.apartment_number).filter(Boolean))]
  const locations = [...new Set(rooms.map((r) => r.apartment?.location?.name).filter(Boolean))]
  const apts = numbers.length ? numbers.map((n) => `Apt ${n}`).join(', ') : 'Apartment'
  return locations.length ? `${apts} — ${locations.join(' / ')}` : apts
}

function buildEmail(b: BookingRow): { subject: string; html: string; text: string } {
  const name = b.client?.full_name ?? 'Guest'
  const rooms = liveRooms(b)
  const subject = `Booking confirmed — ${b.booking_reference}`

  const roomRows = rooms.map((r) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">Apt ${escapeHtml(r.apartment?.apartment_number ?? '—')}${r.apartment?.location?.name ? ` <span style="color:#888">(${escapeHtml(r.apartment.location.name)})</span>` : ''}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee">${formatDate(r.check_in_date)} → ${formatDate(r.check_out_date)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatMoney(r.rate_per_day)}/night</td>
        </tr>`).join('')

  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:18px;font-weight:bold">VK Luxurious Apartments</div>
      <div style="font-size:13px;opacity:.8">Booking confirmation</div>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px">Thank you for booking with us. Your booking is confirmed.</p>
      <p style="margin:0 0 16px;font-size:15px"><strong>Reference:</strong> ${escapeHtml(b.booking_reference)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${roomRows}
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
        <tr><td style="padding:4px 0">Total</td><td style="padding:4px 0;text-align:right">${formatMoney(b.total_amount)}</td></tr>
        <tr><td style="padding:4px 0">Paid</td><td style="padding:4px 0;text-align:right">${formatMoney(b.amount_paid)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold">Balance</td><td style="padding:4px 0;text-align:right;font-weight:bold">${formatMoney(b.outstanding_balance)}</td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#555">Check-out time is 10:00 on your departure date. Please quote your reference if you contact us about this booking.</p>
      <p style="margin:16px 0 0;font-size:13px;color:#555">We look forward to hosting you.</p>
    </div>
  </div>
</body></html>`

  const text = [
    `Dear ${name},`,
    '',
    'Thank you for booking with VK Luxurious Apartments. Your booking is confirmed.',
    '',
    `Reference: ${b.booking_reference}`,
    ...rooms.map((r) => `Apt ${r.apartment?.apartment_number ?? '—'}${r.apartment?.location?.name ? ` (${r.apartment.location.name})` : ''}: ${formatDate(r.check_in_date)} to ${formatDate(r.check_out_date)}, ${formatMoney(r.rate_per_day)}/night`),
    '',
    `Total: ${formatMoney(b.total_amount)}`,
    `Paid: ${formatMoney(b.amount_paid)}`,
    `Balance: ${formatMoney(b.outstanding_balance)}`,
    '',
    'Check-out time is 10:00 on your departure date.',
  ].join('\n')

  return { subject, html, text }
}

async function sendEmail(b: BookingRow): Promise<Outcome> {
  const to = b.client?.email?.trim() || null
  if (!to) return { channel: 'email', status: 'skipped', recipient: null, error: 'Client has no email address' }
  if (!EMAIL_RE.test(to)) return { channel: 'email', status: 'skipped', recipient: to, error: 'Client email address is not valid' }

  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!key || !from) return { channel: 'email', status: 'skipped', recipient: to, error: 'Email sending is not configured yet' }

  const { subject, html, text } = buildEmail(b)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { channel: 'email', status: 'failed', recipient: to, error: String(body?.message ?? `Resend returned ${res.status}`).slice(0, 500) }
    }
    return { channel: 'email', status: 'sent', recipient: to, provider_message_id: body?.id ?? null }
  } catch (err) {
    return { channel: 'email', status: 'failed', recipient: to, error: String((err as Error)?.message ?? err).slice(0, 500) }
  }
}

// WhatsApp only lets a business open a conversation with a pre-approved
// template. The template body must have exactly these eight variables, in
// this order (see docs/booking-confirmations.md for the text to submit):
//   {{1}} client name      {{2}} booking reference  {{3}} apartment(s) + location
//   {{4}} check-in date    {{5}} check-out date     {{6}} total
//   {{7}} amount paid      {{8}} balance
export function whatsAppParams(b: BookingRow): string[] {
  return [
    b.client?.full_name ?? 'Guest',
    b.booking_reference,
    describeApartments(b),
    formatDate(b.check_in_date),
    formatDate(b.check_out_date),
    formatMoney(b.total_amount),
    formatMoney(b.amount_paid),
    formatMoney(b.outstanding_balance),
    // Template variables may not contain newlines, tabs or 4+ spaces.
  ].map((v) => v.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '—')
}

async function sendWhatsApp(b: BookingRow): Promise<Outcome> {
  const to = toWhatsAppNumber(b.client?.phone)
  if (!to) return { channel: 'whatsapp', status: 'skipped', recipient: b.client?.phone ?? null, error: 'Client has no usable phone number' }

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  if (!token || !phoneId) return { channel: 'whatsapp', status: 'skipped', recipient: to, error: 'WhatsApp sending is not configured yet' }

  const template = Deno.env.get('WHATSAPP_TEMPLATE_NAME') ?? 'booking_confirmation'
  const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en'
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components: [{ type: 'body', parameters: whatsAppParams(b).map((text) => ({ type: 'text', text })) }],
        },
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = body?.error
      const msg = e ? `${e.message ?? 'WhatsApp error'}${e.code ? ` (code ${e.code})` : ''}` : `WhatsApp returned ${res.status}`
      return { channel: 'whatsapp', status: 'failed', recipient: to, error: String(msg).slice(0, 500) }
    }
    return { channel: 'whatsapp', status: 'sent', recipient: to, provider_message_id: body?.messages?.[0]?.id ?? null }
  } catch (err) {
    return { channel: 'whatsapp', status: 'failed', recipient: to, error: String((err as Error)?.message ?? err).slice(0, 500) }
  }
}

const BOOKING_SELECT = `
  id, booking_reference, check_in_date, check_out_date,
  total_amount, amount_paid, outstanding_balance, booking_status,
  client:clients(full_name, phone, email),
  rooms:booking_apartments(check_in_date, check_out_date, rate_per_day, status,
    apartment:apartments(apartment_number, location:locations(name)))
`

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json(req, 401, { error: 'Not signed in' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Acts as the caller: every read below is subject to row-level security.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await asCaller.auth.getUser(authHeader.slice(7))
  if (userError || !userData?.user) return json(req, 401, { error: 'Not signed in' })
  const userId = userData.user.id

  let payload: { booking_id?: unknown; channels?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json(req, 400, { error: 'Invalid request body' })
  }

  const bookingId = typeof payload.booking_id === 'string' ? payload.booking_id : ''
  if (!UUID_RE.test(bookingId)) return json(req, 400, { error: 'booking_id is required' })

  const requested = Array.isArray(payload.channels) ? payload.channels : ['email', 'whatsapp']
  const channels = [...new Set(requested)].filter((c): c is Channel => c === 'email' || c === 'whatsapp')
  if (channels.length === 0) return json(req, 400, { error: 'No valid channel requested' })

  const { data: booking, error: bookingError } = await asCaller
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle()
  if (bookingError) return json(req, 500, { error: 'Could not load the booking' })
  if (!booking) return json(req, 404, { error: 'Booking not found' })

  const b = booking as unknown as BookingRow
  if (b.booking_status === 'cancelled') return json(req, 409, { error: 'This booking is cancelled' })

  const outcomes = await Promise.all(
    channels.map((c) => (c === 'email' ? sendEmail(b) : sendWhatsApp(b))),
  )

  // Service role: the log table has no client write policy on purpose.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: logError } = await admin.from('booking_notifications').insert(
    outcomes.map((o) => ({
      booking_id: b.id,
      channel: o.channel,
      status: o.status,
      recipient: o.recipient,
      provider_message_id: o.provider_message_id ?? null,
      error: o.error ?? null,
      sent_by: userId,
    })),
  )
  if (logError) console.error('[send-booking-confirmation] failed to log outcomes:', logError.message)

  return json(req, 200, {
    results: outcomes.map((o) => ({ channel: o.channel, status: o.status, error: o.error ?? null })),
  })
}

if (import.meta.main) Deno.serve(handle)
