import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function Dialog({ open, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ className, children, onClose }) {
  return (
    <div className={cn('flex items-center justify-between p-5 border-b border-gray-100', className)}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} className="ml-2 p-1 rounded-lg hover:bg-gray-100 text-gray-500">
          <X size={20} />
        </button>
      )}
    </div>
  )
}

export function DialogTitle({ className, children }) {
  return <h2 className={cn('text-lg font-semibold text-gray-900', className)}>{children}</h2>
}

export function DialogContent({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function DialogFooter({ className, children }) {
  return <div className={cn('flex gap-3 p-5 pt-0', className)}>{children}</div>
}
