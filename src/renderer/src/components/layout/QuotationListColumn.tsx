import { MessageSquare, Trash2 } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { Badge } from '@renderer/components/common/Badge'
import { quotationStatusMeta } from '@renderer/lib/statusMeta'
import { useQuotationComments } from '@renderer/state/queries/useQuotation'
import type { Quotation, Sld } from '@shared/types/entities'

interface QuotationListColumnProps {
  quotations: Quotation[]
  sldsById: Map<string, Sld>
  selectedQuotationId: string | null
  onSelect: (quotationId: string) => void
  onDeleteQuotation: (quotation: Quotation) => void
}

export function QuotationListColumn({
  quotations,
  sldsById,
  selectedQuotationId,
  onSelect,
  onDeleteQuotation
}: QuotationListColumnProps): React.JSX.Element {
  const { data: comments = [] } = useQuotationComments(selectedQuotationId)

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-surface">
      <div className="px-4 py-3 font-mono text-[11px] tracking-wider text-text-muted">
        QUOTATIONS
      </div>
      {quotations.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-text-muted">
          No quotations yet — generate one from the extracted components on the Quotation tab.
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-1.5">
          {quotations.map((quotation) => {
            const meta = quotationStatusMeta[quotation.status]
            const selected = quotation.id === selectedQuotationId
            const sld = sldsById.get(quotation.sldId)
            return (
              <div
                key={quotation.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(quotation.id)}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(quotation.id)}
                className={cn(
                  'group rounded-md border px-3 py-2.5 text-left transition-colors cursor-pointer',
                  selected
                    ? 'border-border-strong bg-surface-raised'
                    : 'border-transparent hover:bg-surface-hover'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">{quotation.code}</div>
                    {sld && (
                      <div className="truncate font-mono text-xs text-text-muted">
                        for {sld.filename}
                      </div>
                    )}
                    <Badge tone={meta.tone} className="mt-1.5">
                      {meta.label}
                    </Badge>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteQuotation(quotation)
                    }}
                    className="-m-1.5 shrink-0 rounded p-1.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    title="Delete quotation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {selected && comments.length > 0 && (
                  <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
                      <MessageSquare className="h-3 w-3" />
                      Remarks
                    </div>
                    {comments.map((comment) => (
                      <div key={comment.id} className="text-xs">
                        <p className="text-text-primary">{comment.body}</p>
                        <p className="text-[10px] text-text-muted">
                          {new Date(comment.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
