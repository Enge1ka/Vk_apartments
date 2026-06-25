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
  })
  .refine((data) => data.check_out_date > data.check_in_date, {
    message: 'Check-out must be after check-in',
    path: ['check_out_date'],
  })

function toFieldErrors(zodError) {
  const errors = {}
  for (const issue of zodError.issues) errors[issue.path[0]] = issue.message
  return errors
}

export function validateClientStep(form) {
  const result = clientStepSchema.safeParse(form)
  if (result.success) return { valid: true, errors: {} }
  return { valid: false, errors: toFieldErrors(result.error) }
}

export function validateApartmentStep(form) {
  const result = apartmentStepSchema.safeParse(form)
  if (result.success) return { valid: true, errors: {} }
  return { valid: false, errors: toFieldErrors(result.error) }
}

// The initial-payment step allows 0 (meaning "record as unpaid for now"),
// unlike a later payment against an existing balance which must be > 0 —
// see features/payments/validators.js for that case.
export function validateInitialPayment(amountToPay, totalAmount) {
  const amount = Number(amountToPay) || 0
  if (amount < 0) return { valid: false, error: 'Payment cannot be negative' }
  if (amount > totalAmount) return { valid: false, error: 'Payment cannot exceed the total amount' }
  return { valid: true, error: null }
}

export function validateCancellationReason(reason) {
  const trimmed = reason?.trim()
  if (!trimmed) return { valid: false, value: null, error: 'Enter a cancellation reason' }
  return { valid: true, value: trimmed, error: null }
}
