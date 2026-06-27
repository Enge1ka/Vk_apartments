import { differenceInDays, format, parseISO } from 'date-fns'
import { PAYMENT_STATUS, type PaymentStatus } from '@/shared/constants/status'

export function calcDays(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0
  return Math.max(0, differenceInDays(new Date(checkOut), new Date(checkIn)))
}

export function calcTotal(days: number, ratePerDay: number): number {
  return days * ratePerDay
}

export function formatCurrency(amount?: number | null): string {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: 2,
  }).format(amount || 0)
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
