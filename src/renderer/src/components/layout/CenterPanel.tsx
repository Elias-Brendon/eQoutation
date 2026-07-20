import { useState } from 'react'
import { Check, Download, Flag as FlagIcon, Loader2, MessageSquare, X } from 'lucide-react'
import { Tabs } from '@renderer/components/common/Tabs'
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
import type { CenterTab, Sld } from '@shared/types/entities'

interface CenterPanelProps {
  sld: Sld | null
  activeTab: CenterTab
  onTabChange: (tab: CenterTab) => void
}

export function CenterPanel({ sld, activeTab, onTabChange }: CenterPanelProps): React.JSX.Element {
  const { data: quotation } = useQuotation(sld?.id ?? null)
  const exportQuotation = useExportQuotation()
  const approveQuotation = useApproveQuotation()
  const rejectQuotation = useRejectQuotation()
  const addComment = useAddQuotationComment()
  const { data: flags = [] } = useFlagsByQuotation(quotation?.id ?? null)

  const [modalMode, setModalMode] = useState<QuotationActionMode | null>(null)
  const [flagsPanelOpen, setFlagsPanelOpen] = useState(false)

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
      <section className="flex flex-1 flex-col items-center justify-center bg-bg text-sm text-text-muted">
        Select a single line diagram to preview it here.
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <Tabs
          items={[
            { value: 'pdf', label: 'PDF Diagram' },
            { value: 'quotation', label: 'Quotation (Excel)' }
          ]}
          value={activeTab}
          onChange={onTabChange}
        />
        <span className="font-mono text-xs text-text-muted">{sld.filename}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        {activeTab === 'pdf' ? (
          <>
            <PdfViewer key={sld.id} sldId={sld.id} filename={sld.filename} />
            <ExtractionPanel key={sld.id} sldId={sld.id} />
          </>
        ) : (
          <QuotationTable sldId={sld.id} />
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
            projectId={sld.projectId}
          />
        </>
      )}
    </section>
  )
}
