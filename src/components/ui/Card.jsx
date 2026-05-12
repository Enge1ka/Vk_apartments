import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-2xl bg-white border border-gray-200 shadow-sm', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return <div className={cn('p-5 pb-3', className)} {...props}>{children}</div>
}

export function CardTitle({ className, children, ...props }) {
  return <h3 className={cn('text-base font-semibold text-gray-900', className)} {...props}>{children}</h3>
}

export function CardContent({ className, children, ...props }) {
  return <div className={cn('p-5 pt-2', className)} {...props}>{children}</div>
}
