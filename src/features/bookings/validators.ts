import { z } from 'zod'

const clientStepSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  phone: z.string().trim().min(1, 'Phone number is required'),
})

const apartmentStepSchema = z
  .object({
    location_id: z.string().min(1, 'Select a location'),
    apartment_id: z.string().min(1, 'Select an apartment'),
    check_in_date: z.string().min(1, 'Check-in date is required'),
    check_out_date: z.string().min(1, 'Check-out date is required'),
    // Pre-filled from the apartment's daily_rate but editable, so guard
    // against a blank/zero/negative override producing a zero-total booking.
    // The DB's check_total_amount_matches_rate constraint would still accept
    // rate 0 (0 = 0 × days), so this UI check is the only guard.
    rate_per_day: z.coerce.number('Enter a rate per day').positive('Rate per day must be greater than 0'),
  })
  .refine((data) => data.check_out_date > data.check_in_date, {
    message: 'Check-out must be after check-in',
    path: ['check_out_date'],
  })

function toFieldErrors(zodError: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of zodError.issues) errors[String(issue.path[0])] = issue.message
  return errors
}

export function validateClientStep(form: unknown): { valid: boolean; errors: Record<string, string> } {
  const result = clientStepSchema.safeParse(form)
  if (result.success) return { valid: true, errors: {} }
  return { valid: false, errors: toFieldErrors(result.error) }
}

export function validateApartmentStep(form: unknown): { valid: boolean; errors: Record<string, string> } {
  const result = apartmentStepSchema.safeParse(form)
  if (result.success) return { valid: true, errors: {} }
  return { valid: false, errors: toFieldErrors(result.error) }
}

// The initial-payment step allows 0 (meaning "record as unpaid for now"),
// unlike a later payment against an existing balance which must be > 0 —
// see features/payments/validators.ts for that case.
export function validateInitialPayment(amountToPay: string | number, totalAmount: number): { valid: boolean; error: string | null } {
  const amount = Number(amountToPay) || 0
  if (amount < 0) return { valid: false, error: 'Payment cannot be negative' }
  if (amount > totalAmount) return { valid: false, error: 'Payment cannot exceed the total amount' }
  return { valid: true, error: null }
}

export function validateCancellationReason(reason?: string | null): { valid: boolean; value: string | null; error: string | null } {
  const trimmed = reason?.trim()
  if (!trimmed) return { valid: false, value: null, error: 'Enter a cancellation reason' }
  return { valid: true, value: trimmed, error: null }
}
