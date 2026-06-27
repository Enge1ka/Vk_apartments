import { createContext, useContext, useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { X } from 'lucide-react'

const DialogTitleContext = createContext<string | undefined>(undefined)

interface DialogProps {
  open: boolean
  onClose?: () => void
  children: ReactNode
}

export function Dialog({ open, onClose, children }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Move focus into the dialog when it opens (WCAG 2.4.3) and back to
  // whatever triggered it when it closes, since this is a custom (non-<dialog>) overlay.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      panelRef.current?.focus()
    } else {
      triggerRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <DialogTitleContext.Provider value={titleId}>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto focus:outline-none"
        >
          {children}
        </div>
      </div>
    </DialogTitleContext.Provider>
  )
}

interface DialogHeaderProps extends ComponentPropsWithoutRef<'div'> {
  onClose?: () => void
}

export function DialogHeader({ className, children, onClose }: DialogHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between p-5 border-b border-gray-100', className)}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Close dialog" className="ml-2 p-1 rounded-lg hover:bg-gray-100 text-gray-500">
          <X size={20} />
        </button>
      )}
    </div>
  )
}

export function DialogTitle({ className, children }: ComponentPropsWithoutRef<'h2'>) {
  const titleId = useContext(DialogTitleContext)
  return <h2 id={titleId} className={cn('text-lg font-semibold text-gray-900', className)}>{children}</h2>
}

export function DialogContent({ className, children }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function DialogFooter({ className, children }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex gap-3 p-5 pt-0', className)}>{children}</div>
}
