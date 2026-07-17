import { Check, Download, MessageSquare, X } from 'lucide-react'
import { Tabs } from '@renderer/components/common/Tabs'
import { Button } from '@renderer/components/common/Button'
import { PdfViewer } from '@renderer/components/pdf/PdfViewer'
import { QuotationTable } from '@renderer/components/quotation/QuotationTable'
import type { CenterTab, Quotation, Sld } from '@shared/types/entities'

interface CenterPanelProps {
  sld: Sld | null
  quotation: Quotation | null
  activeTab: CenterTab
  onTabChange: (tab: CenterTab) => void
  onApprove: () => void
  onReject: () => void
  onComment: () => void
  onExport: () => void
}

export function CenterPanel({
  sld,
  quotation,
  activeTab,
  onTabChange,
  onApprove,
  onReject,
  onComment,
  onExport
}: CenterPanelProps): React.JSX.Element {
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
          <PdfViewer key={sld.id} sldId={sld.id} filename={sld.filename} />
        ) : (
          <QuotationTable lines={quotation?.lines ?? []} />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
        <div className="flex gap-2">
          <Button variant="success" size="sm" onClick={onApprove}>
            <Check className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button variant="danger" size="sm" onClick={onReject}>
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button variant="ghost" size="sm" onClick={onComment}>
            <MessageSquare className="h-3.5 w-3.5" />
            Add comment
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-3.5 w-3.5" />
          Export quotation
        </Button>
      </div>
    </section>
  )
}
