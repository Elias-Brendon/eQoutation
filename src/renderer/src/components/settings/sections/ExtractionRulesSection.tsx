import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function ExtractionRulesSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const [newRule, setNewRule] = useState('')

  const rules = settings?.customExtractionRules ?? []

  const removeRule = (rule: string): void => {
    updateSettings.mutate({ customExtractionRules: rules.filter((r) => r !== rule) })
  }

  const handleAddRule = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = newRule.trim()
    if (!trimmed || rules.includes(trimmed)) return
    updateSettings.mutate({ customExtractionRules: [...rules, trimmed] })
    setNewRule('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Extraction Rules</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Company-specific rules appended to every AI extraction prompt, alongside the built-in
          rules and preferred-brand guidance. Use these for conventions the built-in rules
          don&apos;t cover e.g. a house style for a specific component.
        </p>
      </div>

      {rules.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rules.map((rule) => (
            <div
              key={rule}
              className="flex items-start justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary"
            >
              <span>{rule}</span>
              <button
                onClick={() => removeRule(rule)}
                className="shrink-0 text-text-muted hover:text-danger"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAddRule} className="flex gap-2">
        <Input
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          placeholder="Add a rule, e.g. Always flag ABB breakers for review…"
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="sm">
          Add
        </Button>
      </form>
    </div>
  )
}
