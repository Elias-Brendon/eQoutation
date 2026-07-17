import { FileText, Plus } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { Badge } from '@renderer/components/common/Badge'
import { Button } from '@renderer/components/common/Button'
import { sldStatusMeta } from '@renderer/lib/statusMeta'
import type { Sld } from '@shared/types/entities'

interface SldListColumnProps {
  slds: Sld[]
  selectedSldId: string | null
  onSelect: (sldId: string) => void
  onAddSld: () => void
  addDisabled?: boolean
}

export function SldListColumn({
  slds,
  selectedSldId,
  onSelect,
  onAddSld,
  addDisabled
}: SldListColumnProps): React.JSX.Element {
  const groups = groupBySection(slds)

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-[11px] tracking-wider text-text-muted">
          SINGLE LINE DIAGRAMS
        </span>
        <button
          onClick={onAddSld}
          disabled={addDisabled}
          className="text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
          title="Add SLD entry"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {slds.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-text-muted">
          No SLDs yet.
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={onAddSld}
            disabled={addDisabled}
          >
            <Plus className="h-3.5 w-3.5" />
            Add SLD
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map(([section, items]) => (
          <div key={section} className="mb-3">
            <div className="px-2 py-1.5 text-xs font-medium text-text-muted">{section}</div>
            <div className="flex flex-col gap-1">
              {items.map((sld) => {
                const meta = sldStatusMeta[sld.status]
                const selected = sld.id === selectedSldId
                return (
                  <button
                    key={sld.id}
                    onClick={() => onSelect(sld.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer',
                      selected
                        ? 'bg-surface-raised text-text-primary'
                        : 'text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <span className="flex-1 truncate font-mono text-xs">{sld.filename}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function groupBySection(slds: Sld[]): [string, Sld[]][] {
  const map = new Map<string, Sld[]>()
  for (const sld of slds) {
    const bucket = map.get(sld.sectionGroup) ?? []
    bucket.push(sld)
    map.set(sld.sectionGroup, bucket)
  }
  return Array.from(map.entries())
}
