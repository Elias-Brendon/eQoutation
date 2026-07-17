import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@renderer/lib/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
