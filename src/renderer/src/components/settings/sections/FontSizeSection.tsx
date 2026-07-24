import { cn } from '@renderer/lib/cn'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
import type { FontScale } from '@shared/types/entities'

const OPTIONS: { value: FontScale; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' }
]

export function FontSizeSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Font Size</h3>
      <p className="text-xs text-text-secondary">Scales the whole app's text size.</p>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => updateSettings.mutate({ fontScale: option.value })}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
              settings?.fontScale === option.value
                ? 'border-accent bg-accent text-white'
                : 'border-border-strong text-text-secondary hover:bg-surface-hover'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
