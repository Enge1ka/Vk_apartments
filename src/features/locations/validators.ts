import { z } from 'zod'

export const locationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required'),
  city: z.string().trim().optional(),
})

export type LocationFormInput = z.infer<typeof locationSchema>

export function validateLocation(form: unknown):
  | { valid: true; data: LocationFormInput; errors: Record<string, never> }
  | { valid: false; data: null; errors: Record<string, string> } {
  const result = locationSchema.safeParse(form)
  if (result.success) return { valid: true, data: result.data, errors: {} }

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) errors[String(issue.path[0])] = issue.message
  return { valid: false, data: null, errors }
}
