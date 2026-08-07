import { FolderOpen } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { useCatalogStatus } from '@renderer/state/queries/useCatalog'
import { usePickCatalogDir } from '@renderer/state/queries/useSettings'

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString()
}

export function CatalogPathSection(): React.JSX.Element {
  const { data: status } = useCatalogStatus()
  const pickCatalogDir = usePickCatalogDir()

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Catalog Path</h3>
      <p className="text-xs text-text-secondary">
        The folder containing your catalog .xlsx file. The first .xlsx found there is loaded as the
        source of truth for pricing and matching.
      </p>
      <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
        <div className="truncate text-text-secondary" title={status?.catalogDir}>
          {status?.catalogDir ?? 'Not set'}
        </div>
        <div className="mt-0.5 text-text-muted">
          {status ? `${status.itemCount} items` : 'Loading…'} · last synced{' '}
          {formatTimestamp(status?.lastSyncedAt ?? null)}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => pickCatalogDir.mutate()}
        disabled={pickCatalogDir.isPending}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        Change folder
      </Button>
      {pickCatalogDir.data && !pickCatalogDir.data.reload.ok && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger">
          {pickCatalogDir.data.reload.error}
        </div>
      )}
      {pickCatalogDir.data?.reload.ok && (
        <div className="rounded-md border border-success/40 bg-success-bg px-3 py-2 text-xs text-success">
          Loaded {pickCatalogDir.data.reload.itemCount} items from the new folder.
        </div>
      )}
    </div>
  )
}
