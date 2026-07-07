import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Extracts a human-readable message from anything thrown. Supabase/PostgREST
// errors are plain objects with a `message` (and often `details`/`hint`), not
// Error instances — String()-ing them yields the useless "[object Object]".
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown }
    const parts = [e.message, e.details, e.hint].filter(v => typeof v === 'string' && v) as string[]
    if (parts.length) return parts.join(' — ')
  }
  return String(err)
}
