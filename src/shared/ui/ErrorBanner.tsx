import { AlertTriangle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface ErrorBannerProps {
  error: Error
  className?: string
}

// Generic "this page's data failed to load" banner — pages that need a
// more specific message (e.g. ApartmentsPage's missing-tables guidance)
// should keep their own bespoke error UI instead of this.
export function ErrorBanner({ error, className }: ErrorBannerProps) {
  return (
    <div className={cn('rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800', className)}>
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle size={16} className="text-red-500" />
        Couldn't load this page's data
      </div>
      <p className="mt-1 font-mono text-xs text-red-700">{error.message}</p>
    </div>
  )
}
