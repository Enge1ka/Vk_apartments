import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-[#1e3a5f] text-white hover:bg-[#16304f] active:bg-[#122845]',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'text-gray-700 hover:bg-gray-100',
  link: 'text-[#1e3a5f] underline-offset-4 hover:underline',
}

const sizes = {
  default: 'h-12 px-5 text-sm',
  sm: 'h-9 px-3 text-xs',
  lg: 'h-14 px-6 text-base',
  icon: 'h-10 w-10',
}

const Button = forwardRef(({ className, variant = 'default', size = 'default', disabled, children, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
      variants[variant],
      sizes[size],
      className
    )}
    {...props}
  >
    {children}
  </button>
))
Button.displayName = 'Button'

export { Button }
