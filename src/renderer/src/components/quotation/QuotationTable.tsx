import { useMemo } from 'react'
import { Flag as FlagIcon, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { Button } from '@renderer/components/common/Button'
import { Badge } from '@renderer/components/common/Badge'
import { useGenerateQuotation, useQuotation } from '@renderer/state/queries/useQuotation'
import { useFlagsByQuotation } from '@renderer/state/queries/useFlags'

interface QuotationTableProps {
  sldId: string
}

export function QuotationTable({ sldId }: QuotationTableProps): React.JSX.Element {
  const { data: quotation, isLoading } = useQuotation(sldId)
  const generate = useGenerateQuotation()
  const { data: flags = [] } = useFlagsByQuotation(quotation?.id ?? null)

  const openFlagCountByLine = useMemo(() => {
    const map = new Map<string, number>()
    for (const flag of flags) {
      if (flag.status === 'open' && flag.quotationLineId) {
        map.set(flag.quotationLineId, (map.get(flag.quotationLineId) ?? 0) + 1)
      }
    }
    return map
  }, [flags])

  const lines = quotation?.lines ?? []
  const matchedCount = lines.filter((l) => l.matchStatus === 'matched').length
  const grandTotal = lines.reduce((sum, l) => sum + l.quotePrice, 0)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface text-sm text-text-muted">
        <div>No quotation yet — generate one from the extracted components.</div>
        <Button
          variant="accent"
          size="sm"
          onClick={() => generate.mutate(sldId)}
          disabled={generate.isPending}
        >
          {generate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Generate quotation
        </Button>
        {generate.isError && (
          <div className="max-w-md text-center text-xs text-danger">{generate.error.message}</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-text-secondary">{quotation.code}</span>
          <Badge tone={matchedCount === lines.length ? 'success' : 'warning'}>
            {matchedCount}/{lines.length} matched
          </Badge>
          <span className="text-text-muted">
            Total: <span className="font-mono text-text-primary">${grandTotal.toFixed(2)}</span>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generate.mutate(sldId)}
          disabled={generate.isPending}
        >
          {generate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Re-generate
        </Button>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface text-sm text-text-muted">
          No components were extracted for this SLD.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Maker</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit cost</th>
                <th className="px-3 py-2 font-medium">Quote</th>
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
                  <td className="px-3 py-2 text-text-secondary">{line.pageNumber}</td>
                  <td className="px-3 py-2 text-text-primary">
                    {line.description}
                    {line.matchStatus === 'unknown' && (
                      <span className="ml-2 text-xs text-danger">unmatched</span>
                    )}
                    {(openFlagCountByLine.get(line.id) ?? 0) > 0 && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-warning">
                        <FlagIcon className="h-3 w-3" />
                        {openFlagCountByLine.get(line.id)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{line.maker}</td>
                  <td className="px-3 py-2 text-text-secondary">
                    {line.qty} {line.uom}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">${line.unitCost.toFixed(2)}</td>
                  <td className="px-3 py-2 text-text-primary">${line.quotePrice.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
