import { useState } from 'react'
import toast from 'react-hot-toast'
import { Mail, MessageCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  channelLabel,
  listBookingNotifications,
  sendBookingConfirmation,
  summarizeSendResults,
  type BookingNotification,
  type NotificationChannel,
} from '../api'

interface ConfirmationCardProps {
  bookingId: string
  hasEmail: boolean
  hasPhone: boolean
  disabled?: boolean
}

const CHANNELS: { channel: NotificationChannel; icon: typeof Mail }[] = [
  { channel: 'email', icon: Mail },
  { channel: 'whatsapp', icon: MessageCircle },
]

const STATUS_TEXT: Record<BookingNotification['status'], { label: string; className: string }> = {
  sent: { label: 'Sent', className: 'text-green-700' },
  failed: { label: 'Failed', className: 'text-red-600' },
  skipped: { label: 'Not sent', className: 'text-amber-600' },
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Shows whether the booking confirmation reached the client on each channel
// (latest attempt per channel) and lets staff send it again.
export function ConfirmationCard({ bookingId, hasEmail, hasPhone, disabled = false }: ConfirmationCardProps) {
  const { data, refetch } = useSupabaseQuery(
    () => listBookingNotifications(bookingId),
    [bookingId],
    'notifications.listForBooking',
  )
  const [sending, setSending] = useState<NotificationChannel | null>(null)

  async function resend(channel: NotificationChannel) {
    setSending(channel)
    try {
      const summary = summarizeSendResults(await sendBookingConfirmation(bookingId, [channel]))
      if (summary.ok) toast.success(summary.message)
      else toast.error(summary.message)
    } catch (err) {
      toast.error(`Could not send: ${getErrorMessage(err)}`)
    } finally {
      setSending(null)
      refetch()
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Confirmation to client</CardTitle></CardHeader>
      <CardContent className="pt-0 space-y-3 text-sm">
        {CHANNELS.map(({ channel, icon: Icon }) => {
          const latest = (data ?? []).find(n => n.channel === channel)
          const hasContact = channel === 'email' ? hasEmail : hasPhone
          const status = latest ? STATUS_TEXT[latest.status] : null
          return (
            <div key={channel} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-gray-800">
                  <Icon size={16} className="text-gray-400 shrink-0" aria-hidden="true" />
                  {channelLabel(channel)}
                </p>
                {status && latest ? (
                  <p className="text-xs text-gray-500 truncate">
                    <span className={status.className}>{status.label}</span>
                    {' · '}{formatWhen(latest.created_at)}
                    {latest.status !== 'sent' && latest.error ? ` · ${latest.error}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">
                    {hasContact ? 'Not sent yet' : channel === 'email' ? 'Client has no email address' : 'Client has no phone number'}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || !hasContact || sending !== null}
                onClick={() => resend(channel)}
              >
                {sending === channel ? 'Sending…' : latest ? 'Resend' : 'Send'}
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
