import { differenceInDays, format, parseISO } from 'date-fns'
import { PAYMENT_STATUS, type PaymentStatus } from '@/shared/constants/status'

export function calcDays(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0
  // parseISO (not `new Date()`) to match formatDate's parsing — `new Date('2026-01-10')`
  // reads as UTC midnight, which can shift a day off in timezones behind UTC.
  return Math.max(0, differenceInDays(parseISO(checkOut), parseISO(checkIn)))
}

export function calcTotal(days: number, ratePerDay: number): number {
  return days * ratePerDay
}

export function formatCurrency(amount?: number | null): string {
  const value = amount ?? 0
  // `amount || 0` used to also catch NaN (NaN is falsy) and silently print
  // "K0.00" for corrupt data — surface it instead of hiding it.
  if (Number.isNaN(value)) {
    console.error('[formatCurrency] received NaN amount')
    return '—'
  }
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function generateBookingRef(sequence: number | string): string {
  const year = new Date().getFullYear()
  return `VKL-${year}-${String(sequence).padStart(4, '0')}`
}

export function generateReceiptNumber(sequence: number | string): string {
  const year = new Date().getFullYear()
  return `RCP-${year}-${String(sequence).padStart(4, '0')}`
}

export function getPaymentStatus(totalAmount: number, amountPaid?: number | null): PaymentStatus {
  if (!amountPaid || amountPaid <= 0) return PAYMENT_STATUS.UNPAID
  if (amountPaid >= totalAmount) return PAYMENT_STATUS.PAID
  return PAYMENT_STATUS.PARTIAL
}
