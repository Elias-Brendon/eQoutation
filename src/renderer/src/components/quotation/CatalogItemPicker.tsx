import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useCatalogSearch } from '@renderer/state/queries/useCatalog'
import { convertFromBase, convertToBase } from '@shared/lib/currencyConversion'
import type { CatalogItem, NewCatalogItemInput } from '@shared/types/entities'

export type Step = 'search' | 'add'

interface CatalogItemPickerProps {
  isOpen: boolean
  step: Step
  onStepChange: (step: Step) => void
  initialQuery: string
  initialDescriptionForNewItem: string
  initialUomForNewItem: string
  exchangeRate: number
  currency: string
  onPickExisting: (item: CatalogItem) => void
  onSubmitNew: (input: NewCatalogItemInput) => void
  pickPending: boolean
  submitPending: boolean
  pickErrorMessage?: string
  submitErrorMessage?: string
  onCancel: () => void
}

function emptyForm(description: string, uom: string): NewCatalogItemInput {
  return {
    sku: '',
    description,
    maker: '',
    family: '',
    series: '',
    listPrice: 0,
    discountFactor: 1,
    unitPrice: 0,
    uom
  }
}

export function CatalogItemPicker({
  isOpen,
  step,
  onStepChange,
  initialQuery,
  initialDescriptionForNewItem,
  initialUomForNewItem,
  exchangeRate,
  currency,
  onPickExisting,
  onSubmitNew,
  pickPending,
  submitPending,
  pickErrorMessage,
  submitErrorMessage,
  onCancel
}: CatalogItemPickerProps): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [form, setForm] = useState<NewCatalogItemInput>(() =>
    emptyForm(initialDescriptionForNewItem, initialUomForNewItem)
  )

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timeout)
  }, [query])

  const { data: results = [], isFetching } = useCatalogSearch(
    debouncedQuery,
    isOpen && step === 'search'
  )

  const computedUnitPrice = (form.listPrice ?? 0) * (form.discountFactor ?? 1)

  const handleAddSubmit = (): void => {
    if (!form.sku.trim() || !form.description.trim()) return
    onSubmitNew({
      ...form,
      listPrice: convertToBase(form.listPrice ?? 0, exchangeRate),
      unitPrice: convertToBase(computedUnitPrice, exchangeRate)
    })
  }

  return step === 'search' ? (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU, description, maker…"
          className="pl-8"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">SKU</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Maker</th>
              <th className="px-2 py-1.5 text-right font-medium">Unit Price</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {results.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-2 py-1 font-mono text-text-secondary">{item.sku}</td>
                <td
                  className="max-w-40 truncate px-2 py-1 text-text-primary"
                  title={item.description}
                >
                  {item.description}
                </td>
                <td className="px-2 py-1 text-text-secondary">{item.maker}</td>
                <td className="px-2 py-1 text-right text-text-primary">
                  {currency}
                  {convertFromBase(item.unitPrice, exchangeRate).toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPickExisting(item)}
                    disabled={pickPending}
                  >
                    Use
                  </Button>
                </td>
              </tr>
            ))}
            {results.length === 0 && !isFetching && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-text-muted">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pickErrorMessage && (
        <div className="text-xs text-danger">
          <ErrorMessage message={pickErrorMessage} />
        </div>
      )}
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="accent" size="sm" onClick={() => onStepChange('add')}>
          Not in catalog, add it
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="SKU / Type *">
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </Field>
        <Field label="UOM">
          <Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
        </Field>
      </div>
      <Field label="Description *">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Maker">
          <Input value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} />
        </Field>
        <Field label="Family">
          <Input
            value={form.family}
            onChange={(e) => setForm({ ...form, family: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Series">
          <Input
            value={form.series}
            onChange={(e) => setForm({ ...form, series: e.target.value })}
          />
        </Field>
        <Field label="Discount factor">
          <Input
            type="number"
            step="0.01"
            value={form.discountFactor}
            onChange={(e) => setForm({ ...form, discountFactor: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`List price (${currency})`}>
          <Input
            type="number"
            step="0.01"
            value={form.listPrice}
            onChange={(e) => setForm({ ...form, listPrice: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Unit price (cost) (${currency})`}>
          <div className="flex h-9 w-full items-center rounded-md border border-border bg-surface-hover px-3 text-sm text-text-secondary">
            {computedUnitPrice.toFixed(2)}
          </div>
        </Field>
      </div>
      {submitErrorMessage && (
        <div className="text-xs text-danger">
          <ErrorMessage message={submitErrorMessage} />
        </div>
      )}
      <div className="mt-2 flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => onStepChange('search')}>
          Back to search
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleAddSubmit}
            disabled={submitPending || !form.sku.trim() || !form.description.trim()}
          >
            Add & match
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      {children}
    </label>
  )
}
