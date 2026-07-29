import { cn } from '@renderer/lib/cn'

interface LogoProps {
  className?: string
}

/** Placeholder wordmark — swap for a real asset later without touching callers. */
export function Logo({ className }: LogoProps): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
        eQ
      </span>
      <span className="text-sm font-semibold tracking-tight text-text-primary">eQuotation</span>
    </div>
  )
}
