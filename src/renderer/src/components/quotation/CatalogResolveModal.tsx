import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useCatalogSearch } from '@renderer/state/queries/useCatalog'
import {
  useAddCatalogItemAndLink,
  useLinkLineToCatalogItem
} from '@renderer/state/queries/useFlags'
import { useProjects } from '@renderer/state/queries/useProjects'
import type { CatalogItem, NewCatalogItemInput, QuotationLine } from '@shared/types/entities'

interface CatalogResolveModalProps {
  open: boolean
  onClose: () => void
  flagId: string | null
  quotationId: string
  sldId: string
  projectId: string
  line: QuotationLine
}

type Step = 'search' | 'add'

function emptyForm(line: QuotationLine): NewCatalogItemInput {
  return {
    sku: '',
    description: line.description,
    maker: '',
    family: '',
    series: '',
    listPrice: 0,
    discountFactor: 1,
    unitPrice: 0,
    uom: line.uom
  }
}

export function CatalogResolveModal({
  open,
  onClose,
  flagId,
  quotationId,
  sldId,
  projectId,
  line
}: CatalogResolveModalProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState(line.description)
  const [debouncedQuery, setDebouncedQuery] = useState(line.description)
  const [form, setForm] = useState<NewCatalogItemInput>(() => emptyForm(line))

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timeout)
  }, [query])

  const { data: results = [], isFetching } = useCatalogSearch(
    debouncedQuery,
    open && step === 'search'
  )
  const linkItem = useLinkLineToCatalogItem()
  const addAndLink = useAddCatalogItemAndLink()
  const { data: projects = [] } = useProjects()
  const currency = projects.find((p) => p.id === projectId)?.currency ?? '$'

  const ctx = { flagId, quotationId, sldId, projectId }

  const handlePick = (item: CatalogItem): void => {
    linkItem.mutate({ ...ctx, lineId: line.id, catalogItemId: item.id }, { onSuccess: onClose })
  }

  const handleAddSubmit = (): void => {
    if (!form.sku.trim() || !form.description.trim()) return
    addAndLink.mutate({ ...ctx, lineId: line.id, input: form }, { onSuccess: onClose })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Find catalog item' : 'Add to catalog'}
      className="w-[560px] max-w-[90vw]"
    >
      {step === 'search' ? (
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
                      {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePick(item)}
                        disabled={linkItem.isPending}
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
          {linkItem.isError && <div className="text-xs text-danger">{linkItem.error.message}</div>}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onClick={() => setStep('add')}>
              Not in catalog — add it
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
              <Input
                value={form.maker}
                onChange={(e) => setForm({ ...form, maker: e.target.value })}
              />
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
            <Field label="List price">
              <Input
                type="number"
                step="0.01"
                value={form.listPrice}
                onChange={(e) => setForm({ ...form, listPrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit price (cost) *">
              <Input
                type="number"
                step="0.01"
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
              />
            </Field>
          </div>
          {addAndLink.isError && (
            <div className="text-xs text-danger">{addAndLink.error.message}</div>
          )}
          <div className="mt-2 flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep('search')}>
              Back to search
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={handleAddSubmit}
                disabled={addAndLink.isPending || !form.sku.trim() || !form.description.trim()}
              >
                Add & match
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
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
