import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 cursor-pointer',
  {
    variants: {
      variant: {
        accent: 'bg-accent text-white hover:bg-accent-hover',
        outline: 'border border-border-strong text-text-primary hover:bg-surface-hover',
        ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        success: 'border border-success/40 text-success hover:bg-success-bg',
        danger: 'border border-danger/40 text-danger hover:bg-danger-bg'
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5'
      }
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md'
    }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'
