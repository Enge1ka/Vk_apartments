import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/shared/ui/Card'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { ClipboardList } from 'lucide-react'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { formatCurrency } from '@/shared/lib/bookingUtils'
import { listAuditLog, type AuditEntry } from '../api'

const ACTION_LABELS: Record<string, string> = {
  create_booking: 'Created booking',
  add_room: 'Added room',
  check_in: 'Checked in',
  check_out: 'Checked out',
  cancel: 'Cancelled',
  extend: 'Extended stay',
  shorten: 'Shortened stay',
  edit_room: 'Edited room',
  status_change: 'Status change',
  payment: 'Payment recorded',
  refund: 'Refund recorded',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarize(action: string, details: Record<string, any> | null): string {
  if (!details) return ''
  switch (action) {
    case 'create_booking':
      return details.reference ?? ''
    case 'payment':
    case 'refund':
      return `${formatCurrency(Number(details.amount))} · ${String(details.method ?? '').replace('_', ' ')} · ${details.receipt ?? ''}`
    case 'add_room':
      return `${details.apartment ?? ''} · ${details.check_in}→${details.check_out}`
    case 'extend':
    case 'shorten':
      return `${details.apartment ?? ''} · ${details.from?.check_out} → ${details.to?.check_out}`
    case 'edit_room':
      return `${details.apartment ?? ''} · dates/rate updated`
    case 'check_in':
    case 'check_out':
    case 'cancel':
      return `${details.apartment ?? ''}`
    default:
      return ''
  }
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AuditLogTab() {
  const { data: entries, loading, error } = useSupabaseQuery(() => listAuditLog(150), [], 'settings.auditLog')

  if (error) return <ErrorBanner error={error} />
  if (loading) return <div className="text-center text-sm text-gray-400 py-8">Loading…</div>

  const rows = (entries ?? []) as AuditEntry[]
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <ClipboardList size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No activity recorded yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y divide-gray-50">
        {rows.map(e => {
          const label = ACTION_LABELS[e.action] ?? e.action
          const summary = summarize(e.action, e.details)
          const body = (
            <div className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                {summary && <p className="text-xs text-gray-500 truncate">{summary}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{e.actor_name ?? 'Unknown'}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{timeAgo(e.created_at)}</span>
            </div>
          )
          return e.entity_id
            ? <Link key={e.id} to={`/bookings/${e.entity_id}`} className="block hover:bg-gray-50">{body}</Link>
            : <div key={e.id}>{body}</div>
        })}
      </CardContent>
    </Card>
  )
}
