import { useMemo } from 'react'
import { TopBar } from '@renderer/components/layout/TopBar'
import { SldListColumn } from '@renderer/components/layout/SldListColumn'
import { CenterPanel } from '@renderer/components/layout/CenterPanel'
import { QuotationListColumn } from '@renderer/components/layout/QuotationListColumn'
import { useUiStore } from '@renderer/state/useUiStore'
import { mockFlags, mockProject, mockQuotations, mockSlds } from '@renderer/assets/mock/fixtures'

function App(): React.JSX.Element {
  const {
    selectedSldId,
    selectedQuotationId,
    activeTab,
    selectSld,
    selectQuotation,
    setActiveTab
  } = useUiStore()

  const sldsById = useMemo(() => new Map(mockSlds.map((sld) => [sld.id, sld])), [])
  const quotationBySldId = useMemo(
    () => new Map(mockQuotations.map((quotation) => [quotation.sldId, quotation])),
    []
  )

  const selectedSld = selectedSldId ? (sldsById.get(selectedSldId) ?? null) : null
  const selectedQuotation = selectedQuotationId
    ? (mockQuotations.find((q) => q.id === selectedQuotationId) ?? null)
    : null

  const aiFlagCount = mockFlags.filter((f) => f.origin === 'ai' && f.status === 'open').length
  const manualFlagCount = mockFlags.filter(
    (f) => f.origin === 'human' && f.status === 'open'
  ).length

  const handleSelectSld = (sldId: string): void => {
    const quotation = quotationBySldId.get(sldId)
    selectSld(sldId, quotation?.id ?? null)
  }

  const handleSelectQuotation = (quotationId: string): void => {
    const quotation = mockQuotations.find((q) => q.id === quotationId)
    if (quotation) selectQuotation(quotation.id, quotation.sldId)
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text-primary">
      <TopBar
        project={mockProject}
        aiFlagCount={aiFlagCount}
        manualFlagCount={manualFlagCount}
        onUploadClick={() => console.log('Upload PDF — wired in Stage 3')}
      />
      <div className="flex flex-1 overflow-hidden">
        <SldListColumn slds={mockSlds} selectedSldId={selectedSldId} onSelect={handleSelectSld} />
        <CenterPanel
          sld={selectedSld}
          quotation={selectedQuotation}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onApprove={() => console.log('Approve — wired in Stage 8')}
          onReject={() => console.log('Reject — wired in Stage 8')}
          onComment={() => console.log('Add comment — wired in Stage 8')}
          onExport={() => console.log('Export quotation — wired in Stage 11')}
        />
        <QuotationListColumn
          quotations={mockQuotations}
          sldsById={sldsById}
          selectedQuotationId={selectedQuotationId}
          onSelect={handleSelectQuotation}
        />
      </div>
    </div>
  )
}

export default App
