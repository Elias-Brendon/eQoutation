import { useEffect, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag as FlagIcon,
  Loader2,
  Maximize2,
  MessageSquare,
  X
} from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { PdfViewer } from '@renderer/components/pdf/PdfViewer'
import { ExtractionPanel } from '@renderer/components/pdf/ExtractionPanel'
import { QuotationTable } from '@renderer/components/quotation/QuotationTable'
import {
  QuotationActionModal,
  type QuotationActionMode
} from '@renderer/components/quotation/QuotationActionModal'
import { FlagsPanel } from '@renderer/components/quotation/FlagsPanel'
import {
  useAddQuotationComment,
  useApproveQuotation,
  useExportQuotation,
  useQuotation,
  useRejectQuotation
} from '@renderer/state/queries/useQuotation'
import { useFlagsByQuotation } from '@renderer/state/queries/useFlags'
import type { PanelMode, Sld } from '@shared/types/entities'

interface CenterPanelProps {
  sld: Sld | null
  panelMode: PanelMode
  onPanelModeChange: (mode: PanelMode) => void
}

interface RailProps {
  side: 'left' | 'right'
  label: string
  onExpand: () => void
}

// Clicking anywhere on the rail restores split view — no hover preview.
function Rail({ side, label, onExpand }: RailProps): React.JSX.Element {
  const Icon = side === 'left' ? ChevronRight : ChevronLeft
  return (
    <button
      onClick={onExpand}
      title={`Back to split view (${label}) — Ctrl+1`}
      className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-surface py-3 transition-colors hover:bg-surface-hover"
    >
      <Icon className="h-3.5 w-3.5 text-text-secondary" />
      <span className="mt-1 whitespace-nowrap text-[11px] text-text-muted [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  )
}

export function CenterPanel({
  sld,
  panelMode,
  onPanelModeChange
}: CenterPanelProps): React.JSX.Element {
  const { data: quotation } = useQuotation(sld?.id ?? null)
  const exportQuotation = useExportQuotation()
  const approveQuotation = useApproveQuotation()
  const rejectQuotation = useRejectQuotation()
  const addComment = useAddQuotationComment()
  const { data: flags = [] } = useFlagsByQuotation(quotation?.id ?? null)

  const [modalMode, setModalMode] = useState<QuotationActionMode | null>(null)
  const [flagsPanelOpen, setFlagsPanelOpen] = useState(false)
  const [focusPage, setFocusPage] = useState<number | undefined>(undefined)

  // Cross-reference target is per-SLD, not persisted across selection changes.
  useEffect(() => {
    setFocusPage(undefined)
  }, [sld?.id])

  const openFlagCount = flags.filter((f) => f.status === 'open').length
  const isReviewSubmitting =
    approveQuotation.isPending || rejectQuotation.isPending || addComment.isPending

  const handleModalSubmit = (comment: string): void => {
    if (!quotation || !sld) return
    if (modalMode === 'approve') {
      approveQuotation.mutate({
        quotationId: quotation.id,
        sldId: sld.id,
        projectId: sld.projectId,
        comment
      })
    } else if (modalMode === 'reject') {
      rejectQuotation.mutate({
        quotationId: quotation.id,
        sldId: sld.id,
        projectId: sld.projectId,
        comment
      })
    } else if (modalMode === 'comment') {
      addComment.mutate({ quotationId: quotation.id, body: comment })
    }
    setModalMode(null)
  }

  if (!sld) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center bg-bg text-sm text-text-muted">
        Select a single line diagram to preview it here.
      </section>
    )
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      <div className="flex shrink-0 items-center justify-end border-b border-border px-5 py-3">
        <span className="font-mono text-xs text-text-muted">{sld.filename}</span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 p-5">
        {panelMode !== 'quotation-full' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">PDF Diagram</span>
              {panelMode === 'split' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPanelModeChange('pdf-full')}
                  title="Expand PDF diagram — Ctrl+2"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <PdfViewer key={sld.id} sldId={sld.id} filename={sld.filename} focusPage={focusPage} />
            <ExtractionPanel key={sld.id} sldId={sld.id} />
          </div>
        ) : (
          <Rail side="left" label="PDF Diagram" onExpand={() => onPanelModeChange('split')} />
        )}

        {panelMode !== 'pdf-full' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Quotation (Excel)</span>
              {panelMode === 'split' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPanelModeChange('quotation-full')}
                  title="Expand quotation — Ctrl+3"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <QuotationTable sldId={sld.id} projectId={sld.projectId} onFocusLine={setFocusPage} />
          </div>
        ) : (
          <Rail
            side="right"
            label="Quotation (Excel)"
            onExpand={() => onPanelModeChange('split')}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
        <div className="flex gap-2">
          <Button
            variant="success"
            size="sm"
            onClick={() => setModalMode('approve')}
            disabled={!quotation}
            title={quotation ? undefined : 'Generate a quotation first'}
          >
            <Check className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setModalMode('reject')}
            disabled={!quotation}
            title={quotation ? undefined : 'Generate a quotation first'}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModalMode('comment')}
            disabled={!quotation}
            title={quotation ? undefined : 'Generate a quotation first'}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Add comment
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFlagsPanelOpen(true)}
            disabled={!quotation}
            title={quotation ? undefined : 'Generate a quotation first'}
          >
            <FlagIcon className="h-3.5 w-3.5" />
            Flags{openFlagCount > 0 ? ` (${openFlagCount})` : ''}
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            quotation && exportQuotation.mutate({ quotationId: quotation.id, sldId: sld.id })
          }
          disabled={!quotation || exportQuotation.isPending}
          title={quotation ? undefined : 'Generate a quotation first'}
        >
          {exportQuotation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export quotation
        </Button>
      </div>

      {quotation && (
        <>
          <QuotationActionModal
            open={modalMode !== null}
            mode={modalMode ?? 'comment'}
            onClose={() => setModalMode(null)}
            onSubmit={handleModalSubmit}
            isSubmitting={isReviewSubmitting}
          />
          <FlagsPanel
            open={flagsPanelOpen}
            onClose={() => setFlagsPanelOpen(false)}
            quotationId={quotation.id}
            sldId={sld.id}
            projectId={sld.projectId}
            lines={quotation.lines}
          />
        </>
      )}
    </section>
  )
}
