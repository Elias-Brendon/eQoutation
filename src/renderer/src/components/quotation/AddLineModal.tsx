import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { CatalogItemPicker, type Step } from '@renderer/components/quotation/CatalogItemPicker'
import {
  useAddQuotationLine,
  useAddQuotationLineWithNewCatalogItem
} from '@renderer/state/queries/useQuotation'
import { useProjects } from '@renderer/state/queries/useProjects'
import { currencySymbol } from '@shared/constants/currencies'
import type { CatalogItem, NewCatalogItemInput } from '@shared/types/entities'

interface AddLineModalProps {
  open: boolean
  onClose: () => void
  quotationId: string
  sldId: string
  projectId: string
  panelNames: string[]
  initialPageNumber: number | null
  initialPanelName: string | null
}

export function AddLineModal({
  open,
  onClose,
  quotationId,
  sldId,
  projectId,
  panelNames,
  initialPageNumber,
  initialPanelName
}: AddLineModalProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('search')
  const [pageNumber, setPageNumber] = useState(initialPageNumber ?? 1)
  const [panelName, setPanelName] = useState(initialPanelName ?? panelNames[0] ?? '')
  const [qty, setQty] = useState(1)

  const addLine = useAddQuotationLine()
  const addLineWithNewCatalogItem = useAddQuotationLineWithNewCatalogItem()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === projectId)
  const exchangeRate = project?.exchangeRate ?? 1
  const currency = currencySymbol(project?.currency ?? 'MYR')

  const lineInput = { pageNumber, panelName, qty }

  const handlePick = (item: CatalogItem): void => {
    addLine.mutate(
      { quotationId, catalogItemId: item.id, input: lineInput, sldId },
      { onSuccess: onClose }
    )
  }

  const handleSubmitNew = (input: NewCatalogItemInput): void => {
    addLineWithNewCatalogItem.mutate(
      { quotationId, catalogInput: input, input: lineInput, sldId },
      { onSuccess: onClose }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Add line — find catalog item' : 'Add line — add to catalog'}
      className="w-[560px] max-w-[90vw]"
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Page
          <Input
            type="number"
            min={1}
            value={pageNumber}
            onChange={(e) => setPageNumber(Number(e.target.value))}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-muted">
          Panel
          <Input
            value={panelName}
            onChange={(e) => setPanelName(e.target.value)}
            list="add-line-panel-names"
          />
          <datalist id="add-line-panel-names">
            {panelNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Qty
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
      </div>
      <CatalogItemPicker
        isOpen={open}
        step={step}
        onStepChange={setStep}
        initialQuery=""
        initialDescriptionForNewItem=""
        initialUomForNewItem=""
        exchangeRate={exchangeRate}
        currency={currency}
        onPickExisting={handlePick}
        onSubmitNew={handleSubmitNew}
        pickPending={addLine.isPending}
        submitPending={addLineWithNewCatalogItem.isPending}
        pickErrorMessage={addLine.error?.message}
        submitErrorMessage={addLineWithNewCatalogItem.error?.message}
        onCancel={onClose}
      />
    </Modal>
  )
}
