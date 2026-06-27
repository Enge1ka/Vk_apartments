import jsPDF from 'jspdf'
import { formatCurrency, formatDate } from './bookingUtils'

export interface ReceiptData {
  receiptNumber?: string
  paymentDate?: string | null
  clientName?: string | null
  clientPhone?: string | null
  clientNRC?: string | null
  apartmentNumber?: string | null
  location?: string | null
  checkIn?: string | null
  checkOut?: string | null
  numberOfDays?: number | null
  ratePerDay?: number | null
  totalAmount?: number | null
  amountPaid?: number | null
  outstandingBalance?: number | null
  paymentMethod?: string | null
  staffName?: string | null
  bookingRef?: string | null
}

export function generateReceiptPDF(data: ReceiptData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const pw = doc.internal.pageSize.getWidth()

  // Header
  doc.setFillColor(30, 58, 95)
  doc.rect(0, 0, pw, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('VK LUXURIOUS APARTMENTS', pw / 2, 11, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Copperbelt, Zambia', pw / 2, 17, { align: 'center' })
  doc.text('OFFICIAL RECEIPT', pw / 2, 23, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  let y = 35

  const line = (label: string, value: unknown, bold = false) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, 12, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value ?? '—'), pw - 12, y, { align: 'right' })
    y += 6
  }

  const divider = () => {
    doc.setDrawColor(200, 200, 200)
    doc.line(12, y, pw - 12, y)
    y += 4
  }

  line('Receipt No:', data.receiptNumber, true)
  line('Date:', formatDate(data.paymentDate))
  divider()
  line('Client:', data.clientName)
  line('Phone:', data.clientPhone)
  line('NRC / Passport:', data.clientNRC)
  divider()
  line('Apartment:', data.apartmentNumber)
  line('Location:', data.location)
  line('Check-in:', formatDate(data.checkIn))
  line('Check-out:', formatDate(data.checkOut))
  line('No. of Days:', data.numberOfDays)
  line('Rate per Day:', formatCurrency(data.ratePerDay))
  divider()
  line('Total Amount:', formatCurrency(data.totalAmount), true)
  line('Amount Paid (this receipt):', formatCurrency(data.amountPaid), true)
  line('Outstanding Balance:', formatCurrency(data.outstandingBalance), true)
  line('Payment Method:', data.paymentMethod?.replace('_', ' ').toUpperCase())
  divider()
  line('Recorded by:', data.staffName)
  line('Booking Ref:', data.bookingRef)

  y += 4
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Thank you for choosing VK Luxurious Apartments!', pw / 2, y, { align: 'center' })

  return doc
}

export function downloadReceipt(data: ReceiptData): void {
  const doc = generateReceiptPDF(data)
  doc.save(`Receipt-${data.receiptNumber}.pdf`)
}

export function shareReceiptWhatsApp(data: ReceiptData, phone?: string | null): void {
  const text = `*VK Luxurious Apartments*\nReceipt: ${data.receiptNumber}\nClient: ${data.clientName}\nApartment: ${data.apartmentNumber} (${data.location})\nCheck-in: ${formatDate(data.checkIn)} → Check-out: ${formatDate(data.checkOut)}\nTotal: ${formatCurrency(data.totalAmount)}\nPaid: ${formatCurrency(data.amountPaid)}\nBalance: ${formatCurrency(data.outstandingBalance)}\nThank you!`
  const encoded = encodeURIComponent(text)
  const cleaned = phone?.replace(/\D/g, '')
  window.open(`https://wa.me/${cleaned}?text=${encoded}`, '_blank')
}
