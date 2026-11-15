# Booking confirmations (email + WhatsApp)

When a booking is created, the app calls the `send-booking-confirmation` Edge
Function, which sends the client a confirmation by email (Resend) and WhatsApp
(Meta WhatsApp Business Cloud API). Every attempt is logged in
`booking_notifications` and shown on the booking page, where staff can resend.

- Function: `supabase/functions/send-booking-confirmation/index.ts`
- Table: `supabase-booking-notifications.sql`
- App: `src/features/notifications/`

A channel with no secrets configured is logged as `skipped`, not an error.

## Deploy

```
npx supabase functions deploy send-booking-confirmation --use-api
```

## Secrets

Set with `npx supabase secrets set NAME=value` (never commit these):

| Secret | What it is |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Permanent System User token with `whatsapp_business_messaging` |
| `WHATSAPP_PHONE_NUMBER_ID` | The sending number's ID from Meta's API Setup page (not the phone number) |
| `WHATSAPP_TEMPLATE_NAME` | Optional, defaults to `booking_confirmation` |
| `WHATSAPP_TEMPLATE_LANG` | Optional, defaults to `en` |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | `VK Luxurious Apartments <bookings@vkbooking.com>` |

## WhatsApp template

WhatsApp only lets a business start a conversation with a pre-approved
template. Create this in WhatsApp Manager → Message templates.

- Category: **Utility**
- Name: `booking_confirmation`
- Language: **English** (`en`)
- Header, footer, buttons: none
- Body (exactly eight variables, in this order):

```
Hello {{1}}, your booking with VK Luxurious Apartments is confirmed.

Reference: {{2}}
Apartment: {{3}}
Check-in: {{4}}
Check-out: {{5}}
Total: {{6}}
Paid: {{7}}
Balance: {{8}}

Check-out time is 10:00 on your departure date. Thank you for choosing us.
```

Sample values for the review form: `John Banda`, `VKL-2026-0742`,
`Apt 4 — Nkana East`, `20 Nov 2026`, `23 Nov 2026`, `K1,500.00`, `K500.00`,
`K1,000.00`.

If the template's variables change, update `whatsAppParams()` in the function
to match: the count and order must be identical or Meta rejects the send.

## Phone numbers

Client phones are normalised to international format for WhatsApp:
`0977123456`, `977123456` and `+260 97 712 3456` all become `260977123456`.
Numbers that already include another country code are passed through.
