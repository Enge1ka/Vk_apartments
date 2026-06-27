import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/shared/lib/utils'

export function Label({ className, children, ...props }: ComponentPropsWithoutRef<'label'>) {
  return (
    <label
      className={cn('block text-sm font-medium text-gray-700 mb-1', className)}
      {...props}
    >
      {children}
    </label>
  )
}
