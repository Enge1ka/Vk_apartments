import { cn } from '@/shared/lib/utils'

export function Label({ className, children, ...props }) {
  return (
    <label
      className={cn('block text-sm font-medium text-gray-700 mb-1', className)}
      {...props}
    >
      {children}
    </label>
  )
}
