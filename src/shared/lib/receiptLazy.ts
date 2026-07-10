import type { ReceiptData } from './receiptGenerator'

// Lazy facade over receiptGenerator. jsPDF (~400 kB) is heavy and only needed
// the moment a staff member actually downloads or shares a receipt — not on
// every visit to the booking/payment pages that offer the button. Importing
// through these wrappers keeps that chunk out of the initial page load and
// pulls it in on demand instead.

export async function downloadReceipt(data: ReceiptData): Promise<void> {
  const mod = await import('./receiptGenerator')
  mod.downloadReceipt(data)
}

export async function shareReceiptWhatsApp(data: ReceiptData, phone?: string | null): Promise<void> {
  const mod = await import('./receiptGenerator')
  mod.shareReceiptWhatsApp(data, phone)
}
