import { useState, type FormEvent } from 'react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function MarginsSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const [value, setValue] = useState<string | null>(null)
  const [savedJustNow, setSavedJustNow] = useState(false)

  const displayValue = value ?? settings?.defaultMargin.toString() ?? ''

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const parsed = Number(displayValue)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    updateSettings.mutate({ defaultMargin: parsed }, { onSuccess: () => setSavedJustNow(true) })
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Margins</h3>
      <p className="text-xs text-text-secondary">
        Default markup applied over catalog cost when a quotation is generated (e.g. 1.35 = 35%
        margin). Applies to new quotations only existing lines can still be overridden individually
        in the Quotation table.
      </p>
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
            Default margin multiplier
          </label>
          <Input
            type="number"
            step={0.01}
            min={0}
            value={displayValue}
            onChange={(e) => {
              setValue(e.target.value)
              setSavedJustNow(false)
            }}
            className="w-32"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {savedJustNow && <p className="text-xs text-success">Default margin saved.</p>}
    </div>
  )
}
