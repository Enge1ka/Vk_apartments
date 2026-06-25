// Single source of truth for status/payment-method enums shared by forms,
// badges, and filters. Mirrors the CHECK constraints in supabase-schema.sql —
// see docs/database.md.

export const BOOKING_STATUS = {
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
}

export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
}

export const APARTMENT_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
}

export const PAYMENT_METHOD = {
  CASH: 'cash',
  MOBILE_MONEY: 'mobile_money',
  BANK_TRANSFER: 'bank_transfer',
  CARD: 'card',
}

export const PAYMENT_METHOD_OPTIONS = [
  { value: PAYMENT_METHOD.CASH, label: 'Cash' },
  { value: PAYMENT_METHOD.MOBILE_MONEY, label: 'Mobile Money' },
  { value: PAYMENT_METHOD.BANK_TRANSFER, label: 'Bank Transfer' },
  { value: PAYMENT_METHOD.CARD, label: 'Card' },
]

export const BOOKING_STATUS_BADGE = {
  [BOOKING_STATUS.CONFIRMED]: { variant: 'info', label: 'Confirmed' },
  [BOOKING_STATUS.CHECKED_IN]: { variant: 'purple', label: 'Checked In' },
  [BOOKING_STATUS.CHECKED_OUT]: { variant: 'default', label: 'Checked Out' },
  [BOOKING_STATUS.CANCELLED]: { variant: 'danger', label: 'Cancelled' },
}

export const PAYMENT_STATUS_BADGE = {
  [PAYMENT_STATUS.UNPAID]: { variant: 'danger', label: 'Unpaid' },
  [PAYMENT_STATUS.PARTIAL]: { variant: 'warning', label: 'Partial' },
  [PAYMENT_STATUS.PAID]: { variant: 'success', label: 'Paid' },
}

export const APARTMENT_STATUS_BADGE = {
  [APARTMENT_STATUS.AVAILABLE]: { variant: 'success', label: 'Available' },
  [APARTMENT_STATUS.OCCUPIED]: { variant: 'danger', label: 'Occupied' },
  [APARTMENT_STATUS.MAINTENANCE]: { variant: 'default', label: 'Maintenance' },
}

export function getBadge(map, status) {
  return map[status] || { variant: 'default', label: status }
}
