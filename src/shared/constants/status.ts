// Single source of truth for status/payment-method enums shared by forms,
// badges, and filters. Mirrors the CHECK constraints in supabase-schema.sql —
// see docs/database.md.

export const BOOKING_STATUS = {
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
} as const

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS]

export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
} as const

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS]

export const APARTMENT_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
} as const

export type ApartmentStatus = (typeof APARTMENT_STATUS)[keyof typeof APARTMENT_STATUS]

export const PAYMENT_METHOD = {
  CASH: 'cash',
  MOBILE_MONEY: 'mobile_money',
  BANK_TRANSFER: 'bank_transfer',
  CARD: 'card',
} as const

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD]

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: PAYMENT_METHOD.CASH, label: 'Cash' },
  { value: PAYMENT_METHOD.MOBILE_MONEY, label: 'Mobile Money' },
  { value: PAYMENT_METHOD.BANK_TRANSFER, label: 'Bank Transfer' },
  { value: PAYMENT_METHOD.CARD, label: 'Card' },
]

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

export interface Badge {
  variant: BadgeVariant
  label: string
}

export const BOOKING_STATUS_BADGE: Record<BookingStatus, Badge> = {
  [BOOKING_STATUS.CONFIRMED]: { variant: 'info', label: 'Confirmed' },
  [BOOKING_STATUS.CHECKED_IN]: { variant: 'purple', label: 'Checked In' },
  [BOOKING_STATUS.CHECKED_OUT]: { variant: 'default', label: 'Checked Out' },
  [BOOKING_STATUS.CANCELLED]: { variant: 'danger', label: 'Cancelled' },
}

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, Badge> = {
  [PAYMENT_STATUS.UNPAID]: { variant: 'danger', label: 'Unpaid' },
  [PAYMENT_STATUS.PARTIAL]: { variant: 'warning', label: 'Partial' },
  [PAYMENT_STATUS.PAID]: { variant: 'success', label: 'Paid' },
}

export const APARTMENT_STATUS_BADGE: Record<ApartmentStatus, Badge> = {
  [APARTMENT_STATUS.AVAILABLE]: { variant: 'success', label: 'Available' },
  [APARTMENT_STATUS.OCCUPIED]: { variant: 'danger', label: 'Occupied' },
  [APARTMENT_STATUS.MAINTENANCE]: { variant: 'default', label: 'Maintenance' },
}

// `status` is typed as `string`, not the narrower union, because callers
// pass whatever a (still partly untyped, mid-migration) API response
// contains — falling back to a default badge for anything unrecognized is
// the whole point of this helper.
export function getBadge(map: Record<string, Badge>, status: string): Badge {
  return map[status] || { variant: 'default', label: status }
}
