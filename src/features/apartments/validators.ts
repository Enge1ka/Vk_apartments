import { z } from 'zod'
import { APARTMENT_STATUS } from '@/shared/constants/status'

// Form inputs arrive as strings; treat '' the same as "not provided" instead
// of coercing it to 0, matching the previous ad hoc `form.x ? Number(form.x) : null` checks.
// Rates round to whole kwacha (Math.round(NaN) stays NaN, so junk still fails
// the number check) — decimal rates only ever produced float-drift totals.
const optionalRate = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Math.round(Number(v))),
  z.number('Must be a number').nonnegative('Must be 0 or greater').optional()
)

export const apartmentSchema = z.object({
  location_id: z.string().min(1, 'Location is required'),
  apartment_number: z.string().trim().min(1, 'Apartment number is required'),
  type: z.string().min(1, 'Type is required'),
  daily_rate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Math.round(Number(v))),
    z.number('Daily rate is required').positive('Daily rate must be greater than 0')
  ),
  weekly_rate: optionalRate,
  monthly_rate: optionalRate,
  status: z.enum(Object.values(APARTMENT_STATUS)),
  notes: z.string().trim().optional(),
})

export type ApartmentFormInput = z.infer<typeof apartmentSchema>

export function validateApartment(form: unknown):
  | { valid: true; data: ApartmentFormInput; errors: Record<string, never> }
  | { valid: false; data: null; errors: Record<string, string> } {
  const result = apartmentSchema.safeParse(form)
  if (result.success) return { valid: true, data: result.data, errors: {} }

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) errors[String(issue.path[0])] = issue.message
  return { valid: false, data: null, errors }
}
