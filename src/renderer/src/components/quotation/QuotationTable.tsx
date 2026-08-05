import { useEffect, useMemo, useState } from 'react'
import { Flag as FlagIcon, Loader2, Plus, Sparkles } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { Button } from '@renderer/components/common/Button'
import { Badge } from '@renderer/components/common/Badge'
import { Tabs } from '@renderer/components/common/Tabs'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { CatalogResolveModal } from '@renderer/components/quotation/CatalogResolveModal'
import { ConfidenceResolveDrawer } from '@renderer/components/quotation/ConfidenceResolveDrawer'
import { AddLineModal } from '@renderer/components/quotation/AddLineModal'
import {
  useGenerateQuotation,
  useQuotation,
  useUpdateLineMargin,
  useUpdatePanelMargin
} from '@renderer/state/queries/useQuotation'
import { useFlagsByQuotation } from '@renderer/state/queries/useFlags'
import { useSettings } from '@renderer/state/queries/useSettings'
import { useProjects } from '@renderer/state/queries/useProjects'
import { currencySymbol } from '@shared/constants/currencies'
import { convertFromBase } from '@shared/lib/currencyConversion'
import type { Flag, QuotationLine } from '@shared/types/entities'

// Stable message prefix set by quotations.ipc.ts's auto-flagging — lets the
// UI distinguish low-confidence flags from other AI flags without a schema change.
const LOW_CONFIDENCE_PREFIX = 'Low-confidence extraction:'

// Matches quotationExcelBuilder.ts's panel grouping: one panel = one SLD page.
const FULL_BOM_TAB = 'full'

interface MarginCellProps {
  line: QuotationLine
  sldId: string
}

function MarginCell({ line, sldId }: MarginCellProps): React.JSX.Element {
  const [value, setValue] = useState(line.margin.toString())
  const updateMargin = useUpdateLineMargin()

  const commit = (): void => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === line.margin) {
      setValue(line.margin.toString())
      return
    }
    updateMargin.mutate({ lineId: line.id, margin: parsed, sldId })
  }

  return (
    <input
      type="number"
      step={0.01}
      min={0}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="h-7 w-16 rounded border border-border-strong bg-surface px-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
    />
  )
}

interface PanelMarginFieldProps {
  quotationId: string
  sldId: string
  panelName: string
  panelLines: QuotationLine[]
}

// Bulk-sets the margin for every line currently in this panel. Prefills
// with the panel's current margin when every line shares one; otherwise
// leaves it blank (mixed per-line overrides already in effect) rather than
// implying a value that isn't actually uniform.
function PanelMarginField({
  quotationId,
  sldId,
  panelName,
  panelLines
}: PanelMarginFieldProps): React.JSX.Element {
  const uniformMargin = panelLines.every((l) => l.margin === panelLines[0]?.margin)
    ? (panelLines[0]?.margin ?? null)
    : null
  const [value, setValue] = useState(uniformMargin?.toString() ?? '')
  const updatePanelMargin = useUpdatePanelMargin()

  useEffect(() => {
    setValue(uniformMargin?.toString() ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelName, uniformMargin])

  const commit = (): void => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValue(uniformMargin?.toString() ?? '')
      return
    }
    updatePanelMargin.mutate({ quotationId, panelName, margin: parsed, sldId })
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
      Panel margin:
      <input
        type="number"
        step={0.01}
        min={0}
        value={value}
        placeholder="mixed"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        title={`Set the margin for every line in "${panelName}" at once`}
        className="h-7 w-16 rounded border border-border-strong bg-surface px-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
      />
    </div>
  )
}

interface QuotationTableProps {
  sldId: string
  projectId: string
  onFocusLine?: (pageNumber: number) => void
  onRevealLineAnnotation?: (lineId: string) => void
}

export function QuotationTable({
  sldId,
  projectId,
  onFocusLine,
  onRevealLineAnnotation
}: QuotationTableProps): React.JSX.Element {
  const { data: quotation, isLoading } = useQuotation(sldId)
  const generate = useGenerateQuotation()
  const { data: flags = [] } = useFlagsByQuotation(quotation?.id ?? null)
  const { data: settings } = useSettings()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === projectId)
  const exchangeRate = project?.exchangeRate ?? 1
  const currency = currencySymbol(project?.currency ?? 'MYR')
  const confidenceThreshold = settings?.confidenceThreshold ?? 0.7
  const [resolveLine, setResolveLine] = useState<QuotationLine | null>(null)
  const [confidenceLine, setConfidenceLine] = useState<QuotationLine | null>(null)
  const [activeTab, setActiveTab] = useState<string>(FULL_BOM_TAB)
  const [addLineOpen, setAddLineOpen] = useState(false)

  // Tab selection is per-quotation, not persisted across switching SLDs/quotations.
  useEffect(() => {
    setActiveTab(FULL_BOM_TAB)
  }, [quotation?.id])

  const openFlagCountByLine = useMemo(() => {
    const map = new Map<string, number>()
    for (const flag of flags) {
      if (flag.status === 'open' && flag.quotationLineId) {
        map.set(flag.quotationLineId, (map.get(flag.quotationLineId) ?? 0) + 1)
      }
    }
    return map
  }, [flags])

  // If the double-clicked line happens to have an open flag, resolving via
  // the modal should close that flag out too instead of leaving it dangling.
  const openFlagIdForLine = (lineId: string): string | null =>
    flags.find((f) => f.status === 'open' && f.quotationLineId === lineId)?.id ?? null

  const openLowConfidenceFlagForLine = (lineId: string): Flag | null =>
    flags.find(
      (f) =>
        f.status === 'open' &&
        f.quotationLineId === lineId &&
        f.message.startsWith(LOW_CONFIDENCE_PREFIX)
    ) ?? null

  const handleRowDoubleClick = (line: QuotationLine): void => {
    if (line.matchStatus === 'unknown') {
      setResolveLine(line)
      return
    }
    const lowConfidenceFlag = openLowConfidenceFlagForLine(line.id)
    if (lowConfidenceFlag) {
      setConfidenceLine(line)
      return
    }
    setResolveLine(line)
  }

  const lines = quotation?.lines ?? []
  // Ordered by where each panel first appears in the SLD, matching the
  // Excel export's sheet order — not alphabetically by panel name.
  const panelNames = useMemo(() => {
    const names = [...new Set(lines.map((l) => l.panelName))]
    const minPageFor = (name: string): number =>
      Math.min(...lines.filter((l) => l.panelName === name).map((l) => l.pageNumber))
    return names.sort((a, b) => minPageFor(a) - minPageFor(b))
  }, [lines])
  const panelTabs = useMemo(
    () => [
      { value: FULL_BOM_TAB, label: 'Full BOM' },
      ...panelNames.map((name) => ({ value: name, label: name }))
    ],
    [panelNames]
  )
  const visibleLines =
    activeTab === FULL_BOM_TAB ? lines : lines.filter((l) => l.panelName === activeTab)
  const matchedCount = visibleLines.filter((l) => l.matchStatus === 'matched').length
  const grandTotal = visibleLines.reduce((sum, l) => sum + l.quotePrice, 0)

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
          <div className="max-w-md text-center text-xs text-danger">
            <ErrorMessage message={generate.error.message} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-text-secondary">{quotation.code}</span>
          <Badge tone={matchedCount === visibleLines.length ? 'success' : 'warning'}>
            {matchedCount}/{visibleLines.length} matched
          </Badge>
          <span className="text-text-muted">
            Total:{' '}
            <span className="font-mono text-text-primary">
              {currency}
              {convertFromBase(grandTotal, exchangeRate).toFixed(2)}
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddLineOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
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
      </div>

      {panelNames.length > 1 && (
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3">
          <Tabs
            items={panelTabs}
            value={activeTab}
            onChange={setActiveTab}
            className="min-w-0 flex-1"
          />
          {activeTab !== FULL_BOM_TAB && (
            <PanelMarginField
              quotationId={quotation.id}
              sldId={sldId}
              panelName={activeTab}
              panelLines={visibleLines}
            />
          )}
        </div>
      )}

      {visibleLines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface text-sm text-text-muted">
          {lines.length === 0
            ? 'No components were extracted for this SLD.'
            : 'No components on this page.'}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Maker</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit cost</th>
                <th className="px-3 py-2 font-medium">Margin</th>
                <th className="px-3 py-2 font-medium">Quote</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line) => (
                <tr
                  key={line.id}
                  onClick={() => {
                    onFocusLine?.(line.pageNumber)
                    onRevealLineAnnotation?.(line.id)
                  }}
                  onDoubleClick={() => handleRowDoubleClick(line)}
                  title="Click to jump the PDF to this page — double-click to find or set this line's catalog item"
                  className={cn(
                    'cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover',
                    line.matchStatus === 'unknown' && 'bg-danger-bg/40'
                  )}
                >
                  <td className="px-3 py-2 text-text-secondary">{line.pageNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                    {line.sku || '—'}
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {line.description}
                    {line.matchStatus === 'unknown' && (
                      <span className="ml-2 text-xs text-danger">unmatched</span>
                    )}
                    {line.aiConfidence < confidenceThreshold && (
                      <Badge tone="warning" className="ml-2">
                        {(line.aiConfidence * 100).toFixed(0)}% confidence
                      </Badge>
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
                  <td className="px-3 py-2 text-text-secondary">
                    {currency}
                    {convertFromBase(line.unitCost, exchangeRate).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <MarginCell line={line} sldId={sldId} />
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {currency}
                    {convertFromBase(line.quotePrice, exchangeRate).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolveLine && (
        <CatalogResolveModal
          key={resolveLine.id}
          open
          onClose={() => setResolveLine(null)}
          flagId={openFlagIdForLine(resolveLine.id)}
          quotationId={quotation.id}
          sldId={sldId}
          projectId={projectId}
          line={resolveLine}
        />
      )}

      {confidenceLine && (
        <ConfidenceResolveDrawer
          key={confidenceLine.id}
          open
          onClose={() => setConfidenceLine(null)}
          flagId={openLowConfidenceFlagForLine(confidenceLine.id)?.id ?? null}
          quotationId={quotation.id}
          sldId={sldId}
          projectId={projectId}
          line={confidenceLine}
          onFocusLine={onFocusLine}
        />
      )}

      {addLineOpen && (
        <AddLineModal
          open
          onClose={() => setAddLineOpen(false)}
          quotationId={quotation.id}
          sldId={sldId}
          projectId={projectId}
          panelNames={panelNames}
          initialPageNumber={activeTab === FULL_BOM_TAB ? null : (visibleLines[0]?.pageNumber ?? null)}
          initialPanelName={activeTab === FULL_BOM_TAB ? null : activeTab}
        />
      )}
    </div>
  )
}
