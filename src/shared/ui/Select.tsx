import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/shared/lib/utils'

const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 appearance-none',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

export { Select }
