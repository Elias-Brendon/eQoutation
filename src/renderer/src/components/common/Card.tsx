import { type HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface-raised transition-colors',
        className
      )}
      {...props}
    />
  )
}
