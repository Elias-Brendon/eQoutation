import { cn } from '@renderer/lib/cn'
import { Badge } from '@renderer/components/common/Badge'
import { quotationStatusMeta } from '@renderer/lib/statusMeta'
import type { Quotation, Sld } from '@shared/types/entities'

interface QuotationListColumnProps {
  quotations: Quotation[]
  sldsById: Map<string, Sld>
  selectedQuotationId: string | null
  onSelect: (quotationId: string) => void
}

export function QuotationListColumn({
  quotations,
  sldsById,
  selectedQuotationId,
  onSelect
}: QuotationListColumnProps): React.JSX.Element {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-surface">
      <div className="px-4 py-3 font-mono text-[11px] tracking-wider text-text-muted">
        QUOTATIONS
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-1.5">
          {quotations.map((quotation) => {
            const meta = quotationStatusMeta[quotation.status]
            const selected = quotation.id === selectedQuotationId
            const sld = sldsById.get(quotation.sldId)
            return (
              <button
                key={quotation.id}
                onClick={() => onSelect(quotation.id)}
                className={cn(
                  'rounded-md border px-3 py-2.5 text-left transition-colors cursor-pointer',
                  selected
                    ? 'border-border-strong bg-surface-raised'
                    : 'border-transparent hover:bg-surface-hover'
                )}
              >
                <div className="text-sm font-medium text-text-primary">{quotation.code}</div>
                {sld && (
                  <div className="truncate font-mono text-xs text-text-muted">
                    for {sld.filename}
                  </div>
                )}
                <Badge tone={meta.tone} className="mt-1.5">
                  {meta.label}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
