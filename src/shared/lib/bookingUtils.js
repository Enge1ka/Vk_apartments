import { differenceInDays, format, parseISO } from 'date-fns'

export function calcDays(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  return Math.max(0, differenceInDays(new Date(checkOut), new Date(checkIn)))
}

export function calcTotal(days, ratePerDay) {
  return days * ratePerDay
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function generateBookingRef(sequence) {
  const year = new Date().getFullYear()
  return `VKL-${year}-${String(sequence).padStart(4, '0')}`
}

export function generateReceiptNumber(sequence) {
  const year = new Date().getFullYear()
  return `RCP-${year}-${String(sequence).padStart(4, '0')}`
}

export function getPaymentStatus(totalAmount, amountPaid) {
  if (!amountPaid || amountPaid <= 0) return 'unpaid'
  if (amountPaid >= totalAmount) return 'paid'
  return 'partial'
}
