import { z } from 'zod'

// Shared by every place that records a payment against an existing balance
// (NewBooking's initial payment step, BookingDetail, and the Payments page) —
// previously this amount-vs-balance check was reimplemented per form.
export function validatePaymentAmount(amount, outstandingBalance) {
  const schema = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number('Enter a valid amount')
      .positive('Enter a valid amount')
      .max(Number(outstandingBalance) || 0, 'Payment cannot exceed the outstanding balance')
  )
  const result = schema.safeParse(amount)
  if (result.success) return { valid: true, value: result.data, error: null }
  return { valid: false, value: null, error: result.error.issues[0]?.message || 'Invalid amount' }
}
