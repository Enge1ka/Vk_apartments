import { supabase } from '@/shared/lib/supabase'

// The only module allowed to call the send-booking-confirmation Edge
// Function or read the booking_notifications table.

export type NotificationChannel = 'email' | 'whatsapp'
export type NotificationStatus = 'sent' | 'failed' | 'skipped'

export interface BookingNotification {
  id: string
  booking_id: string
  channel: NotificationChannel
  status: NotificationStatus
  recipient: string | null
  error: string | null
  created_at: string
}

export interface SendResult {
  channel: NotificationChannel
  status: NotificationStatus
  error: string | null
}

// Asks the server to send the booking confirmation to the client. The
// message content and recipient are built server-side from the booking —
// this only says which booking and which channels. Throws if the function
// itself could not be reached; a channel that failed or was skipped is
// reported in the returned results, not thrown.
export async function sendBookingConfirmation(
  bookingId: string,
  channels: NotificationChannel[] = ['email', 'whatsapp'],
): Promise<SendResult[]> {
  const { data, error } = await supabase.functions.invoke('send-booking-confirmation', {
    body: { booking_id: bookingId, channels },
  })
  if (error) throw error
  return (data?.results ?? []) as SendResult[]
}

export async function listBookingNotifications(bookingId: string): Promise<BookingNotification[]> {
  const { data, error } = await supabase
    .from('booking_notifications')
    .select('id, booking_id, channel, status, recipient, error, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BookingNotification[]
}

const CHANNEL_LABEL: Record<NotificationChannel, string> = { email: 'Email', whatsapp: 'WhatsApp' }

export function channelLabel(channel: NotificationChannel): string {
  return CHANNEL_LABEL[channel]
}

// One line for a toast after a send attempt, e.g.
// "Confirmation sent by Email and WhatsApp" or
// "WhatsApp failed: Template not approved".
export function summarizeSendResults(results: SendResult[]): { ok: boolean; message: string } {
  const sent = results.filter(r => r.status === 'sent').map(r => channelLabel(r.channel))
  const failed = results.filter(r => r.status === 'failed')
  if (failed.length > 0) {
    return { ok: false, message: failed.map(r => `${channelLabel(r.channel)} failed: ${r.error ?? 'unknown error'}`).join('. ') }
  }
  if (sent.length > 0) return { ok: true, message: `Confirmation sent by ${sent.join(' and ')}` }
  const skipped = results.filter(r => r.status === 'skipped')
  return { ok: false, message: skipped.map(r => `${channelLabel(r.channel)}: ${r.error ?? 'not sent'}`).join('. ') || 'Confirmation not sent' }
}
