import { cn } from '@renderer/lib/cn'
import type { QuotationLine } from '@shared/types/entities'

interface QuotationTableProps {
  lines: QuotationLine[]
}

export function QuotationTable({ lines }: QuotationTableProps): React.JSX.Element {
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface text-sm text-text-muted">
        No line items yet — generate a quotation for this SLD to see it here.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Unit price</th>
            <th className="px-3 py-2 font-medium">Extended</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.id}
              className={cn(
                'border-b border-border last:border-0',
                line.matchStatus === 'unknown' && 'bg-danger-bg/40'
              )}
            >
              <td className="px-3 py-2 text-text-primary">
                {line.description}
                {line.matchStatus === 'unknown' && (
                  <span className="ml-2 text-xs text-danger">unmatched</span>
                )}
              </td>
              <td className="px-3 py-2 text-text-secondary">{line.qty}</td>
              <td className="px-3 py-2 text-text-secondary">${line.unitPrice.toFixed(2)}</td>
              <td className="px-3 py-2 text-text-primary">
                ${(line.qty * line.unitPrice).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
