import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@renderer/lib/cn'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
