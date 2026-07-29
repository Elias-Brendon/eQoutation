import { useState, type KeyboardEvent } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
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
  onDeleteSld: (sld: Sld) => void
  addDisabled?: boolean
}

export function SldListColumn({
  slds,
  selectedSldId,
  onSelect,
  onAddSld,
  onDeleteSld,
  addDisabled
}: SldListColumnProps): React.JSX.Element {
  const groups = groupBySection(slds)

  // Keyboard highlight cursor, independent of selectedSldId (mouse selection)
  // — kept in sync with it when it changes externally (reset during render,
  // not an effect, per https://react.dev/learn/you-might-not-need-an-effect).
  const [highlightedId, setHighlightedId] = useState(selectedSldId)
  const [prevSelectedSldId, setPrevSelectedSldId] = useState(selectedSldId)
  if (selectedSldId !== prevSelectedSldId) {
    setPrevSelectedSldId(selectedSldId)
    setHighlightedId(selectedSldId)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (slds.length === 0) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    e.preventDefault()

    const currentIndex = slds.findIndex((s) => s.id === highlightedId)
    if (e.key === 'Enter') {
      if (highlightedId) onSelect(highlightedId)
      return
    }
    const nextIndex =
      e.key === 'ArrowDown'
        ? Math.min(slds.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex === -1 ? 0 : currentIndex - 1)
    setHighlightedId(slds[nextIndex].id)
  }

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
      <div
        tabIndex={slds.length > 0 ? 0 : -1}
        onKeyDown={handleKeyDown}
        title="Arrow keys to move, Enter to open"
        className="flex-1 overflow-y-auto px-2 pb-4 focus:outline-none"
      >
        {groups.map(([section, items]) => (
          <div key={section} className="mb-3">
            <div className="px-2 py-1.5 text-xs font-medium text-text-muted">{section}</div>
            <div className="flex flex-col gap-1">
              {items.map((sld) => {
                const meta = sldStatusMeta[sld.status]
                const selected = sld.id === selectedSldId
                const highlighted = sld.id === highlightedId
                return (
                  <div
                    key={sld.id}
                    role="button"
                    tabIndex={-1}
                    onClick={() => {
                      setHighlightedId(sld.id)
                      onSelect(sld.id)
                    }}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer',
                      selected
                        ? 'bg-surface-raised text-text-primary'
                        : 'text-text-secondary hover:bg-surface-hover',
                      highlighted && !selected && 'ring-1 ring-inset ring-accent'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <span className="flex-1 truncate font-mono text-xs">{sld.filename}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSld(sld)
                      }}
                      className="-m-1.5 rounded p-1.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      title="Delete SLD"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
