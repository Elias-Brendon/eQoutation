import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
import { useDistinctMakers } from '@renderer/state/queries/useCatalog'
import { BREAKER_TYPES, OTHER_COMPONENT_TYPES } from '@shared/constants/componentTypes'

export function ComponentsSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const { data: makers = [] } = useDistinctMakers()
  const updateSettings = useUpdateSettings()
  const [customType, setCustomType] = useState('')

  const enabled = settings?.enabledComponentTypes ?? []
  const preferredBrandsByType = settings?.preferredBrandsByType ?? {}
  const customTypes = enabled.filter(
    (type) =>
      !(BREAKER_TYPES as readonly string[]).includes(type) &&
      !(OTHER_COMPONENT_TYPES as readonly string[]).includes(type)
  )

  const toggleType = (type: string): void => {
    const next = enabled.includes(type) ? enabled.filter((t) => t !== type) : [...enabled, type]
    updateSettings.mutate({ enabledComponentTypes: next })
  }

  const removeCustomType = (type: string): void => {
    updateSettings.mutate({ enabledComponentTypes: enabled.filter((t) => t !== type) })
  }

  const handleAddCustomType = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = customType.trim()
    if (!trimmed || enabled.includes(trimmed)) return
    updateSettings.mutate({ enabledComponentTypes: [...enabled, trimmed] })
    setCustomType('')
  }

  const setPreferredBrandForType = (type: string, brand: string): void => {
    const next = { ...preferredBrandsByType }
    if (brand) next[type] = brand
    else delete next[type]
    updateSettings.mutate({ preferredBrandsByType: next })
  }

  const brandSelect = (type: string): React.JSX.Element => (
    <select
      value={preferredBrandsByType[type] ?? ''}
      onChange={(e) => setPreferredBrandForType(type, e.target.value)}
      disabled={makers.length === 0}
      title="Preferred brand for this component type, overrides the project-wide Preferred Brands list"
      className="h-6 rounded border border-border-strong bg-surface px-1 text-[11px] text-text-secondary focus:border-accent focus:outline-none disabled:opacity-50"
    >
      <option value="">Project preference</option>
      {makers.map((maker) => (
        <option key={maker} value={maker}>
          {maker}
        </option>
      ))}
    </select>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Components</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Component types the AI is allowed to detect on an SLD. Unchecking a type tells the AI to
          stop recognizing it going forward. Each type&apos;s brand dropdown overrides the
          project-wide Preferred Brands list just for that type.
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-text-secondary">Breakers</h4>
        <div className="flex flex-col gap-1.5">
          {BREAKER_TYPES.map((type) => (
            <div key={type} className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={enabled.includes(type)}
                  onChange={() => toggleType(type)}
                  className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                />
                {type}
              </label>
              {brandSelect(type)}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-text-secondary">Other components</h4>
        <div className="flex flex-col gap-1.5">
          {OTHER_COMPONENT_TYPES.map((type) => (
            <div key={type} className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={enabled.includes(type)}
                  onChange={() => toggleType(type)}
                  className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                />
                {type}
              </label>
              {brandSelect(type)}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-text-secondary">Custom types</h4>
        {customTypes.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {customTypes.map((type) => (
              <div key={type} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-secondary">{type}</span>
                  <button
                    onClick={() => removeCustomType(type)}
                    className="text-text-muted hover:text-danger"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {brandSelect(type)}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleAddCustomType} className="flex gap-2">
          <Input
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="Add a custom component type…"
            className="max-w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            Add
          </Button>
        </form>
      </div>
    </div>
  )
}
