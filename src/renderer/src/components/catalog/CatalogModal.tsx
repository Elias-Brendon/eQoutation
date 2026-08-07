import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, Search } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { Badge } from '@renderer/components/common/Badge'
import {
  useCatalogSearch,
  useCatalogStatus,
  useOpenCatalogFolder,
  useReloadCatalog
} from '@renderer/state/queries/useCatalog'
import { BASE_CURRENCY, currencySymbol } from '@shared/constants/currencies'
import { convertFromBase } from '@shared/lib/currencyConversion'
import type { Project } from '@shared/types/entities'

interface CatalogModalProps {
  open: boolean
  onClose: () => void
  project?: Project | null
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString()
}

export function CatalogModal({ open, onClose, project }: CatalogModalProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const exchangeRate = project?.exchangeRate ?? 1
  const currency = currencySymbol(project?.currency ?? BASE_CURRENCY)

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timeout)
  }, [search])

  const { data: status } = useCatalogStatus()
  const reloadCatalog = useReloadCatalog()
  const openCatalogFolder = useOpenCatalogFolder()
  const { data: items = [], isFetching } = useCatalogSearch(debouncedSearch, open)

  return (
    <Modal open={open} onClose={onClose} title="Catalog" className="w-[720px] max-w-[90vw]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="truncate text-text-secondary" title={status?.catalogDir}>
              {status?.catalogDir ?? '—'}
            </div>
            <div className="mt-0.5 text-text-muted">
              {status ? `${status.itemCount} items` : '—'} · last synced{' '}
              {formatTimestamp(status?.lastSyncedAt ?? null)}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCatalogFolder.mutate()}
              title="Open the catalog folder to drop in an .xlsx file"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open folder
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reloadCatalog.mutate()}
              disabled={reloadCatalog.isPending}
            >
              <RefreshCw
                className={reloadCatalog.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
              />
              Reload
            </Button>
          </div>
        </div>

        {reloadCatalog.data && !reloadCatalog.data.ok && (
          <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger">
            {reloadCatalog.data.error}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, description, maker, family…"
            className="pl-8"
          />
        </div>

        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Maker</th>
                <th className="px-3 py-2 font-medium">Family</th>
                <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                <th className="px-3 py-2 font-medium">UoM</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 font-mono text-text-secondary">{item.sku}</td>
                  <td
                    className="max-w-64 truncate px-3 py-1.5 text-text-primary"
                    title={item.description}
                  >
                    {item.description}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{item.maker}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{item.family}</td>
                  <td className="px-3 py-1.5 text-right text-text-primary">
                    {currency}
                    {convertFromBase(item.unitPrice, exchangeRate).toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{item.uom}</td>
                </tr>
              ))}
              {items.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                    {status?.itemCount === 0
                      ? 'No catalog loaded yet, click Reload.'
                      : 'No matching items.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Showing up to 100 results</span>
          {reloadCatalog.data?.ok && (
            <Badge tone="success">Loaded {reloadCatalog.data.itemCount} items</Badge>
          )}
        </div>
      </div>
    </Modal>
  )
}
