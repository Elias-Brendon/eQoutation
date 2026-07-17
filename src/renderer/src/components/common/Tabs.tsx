import { cn } from '@renderer/lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: string
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className
}: TabsProps<T>): React.JSX.Element {
  return (
    <div
      className={cn('inline-flex rounded-md border border-border p-0.5', className)}
      role="tablist"
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
            item.value === value
              ? 'bg-surface-hover text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
