import { z } from 'zod'

export const locationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required'),
  city: z.string().trim().optional(),
})

export function validateLocation(form) {
  const result = locationSchema.safeParse(form)
  if (result.success) return { valid: true, data: result.data, errors: {} }

  const errors = {}
  for (const issue of result.error.issues) errors[issue.path[0]] = issue.message
  return { valid: false, data: null, errors }
}
