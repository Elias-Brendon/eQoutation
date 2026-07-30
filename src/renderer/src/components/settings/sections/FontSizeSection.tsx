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

      <div className="mt-2 flex flex-col gap-2">
        <h4 className="text-xs font-semibold text-text-primary">Annotation Text Size</h4>
        <p className="text-xs text-text-secondary">
          Font size of the AI annotation info popup shown on the PDF diagram.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={8}
            max={20}
            step={1}
            value={settings?.annotationFontSize ?? 12}
            onChange={(e) => updateSettings.mutate({ annotationFontSize: Number(e.target.value) })}
            className="w-40 accent-accent"
          />
          <span className="w-10 shrink-0 font-mono text-xs text-text-secondary">
            {settings?.annotationFontSize ?? 12}px
          </span>
        </div>
      </div>
    </div>
  )
}
