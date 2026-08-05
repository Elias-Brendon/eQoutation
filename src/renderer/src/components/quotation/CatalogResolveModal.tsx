import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { CatalogItemPicker, type Step } from '@renderer/components/quotation/CatalogItemPicker'
import {
  useAddCatalogItemAndLink,
  useLinkLineToCatalogItem
} from '@renderer/state/queries/useFlags'
import { useProjects } from '@renderer/state/queries/useProjects'
import { currencySymbol } from '@shared/constants/currencies'
import type { CatalogItem, NewCatalogItemInput, QuotationLine } from '@shared/types/entities'

interface CatalogResolveModalProps {
  open: boolean
  onClose: () => void
  flagId: string | null
  quotationId: string
  sldId: string
  projectId: string
  line: QuotationLine
}

export function CatalogResolveModal({
  open,
  onClose,
  flagId,
  quotationId,
  sldId,
  projectId,
  line
}: CatalogResolveModalProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('search')
  const linkItem = useLinkLineToCatalogItem()
  const addAndLink = useAddCatalogItemAndLink()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === projectId)
  const exchangeRate = project?.exchangeRate ?? 1
  const currency = currencySymbol(project?.currency ?? 'MYR')

  const ctx = { flagId, quotationId, sldId, projectId }

  const handlePick = (item: CatalogItem): void => {
    linkItem.mutate({ ...ctx, lineId: line.id, catalogItemId: item.id }, { onSuccess: onClose })
  }

  const handleSubmitNew = (input: NewCatalogItemInput): void => {
    addAndLink.mutate({ ...ctx, lineId: line.id, input }, { onSuccess: onClose })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Find catalog item' : 'Add to catalog'}
      className="w-[560px] max-w-[90vw]"
    >
      <CatalogItemPicker
        isOpen={open}
        step={step}
        onStepChange={setStep}
        initialQuery={line.description}
        initialDescriptionForNewItem={line.description}
        initialUomForNewItem={line.uom}
        exchangeRate={exchangeRate}
        currency={currency}
        onPickExisting={handlePick}
        onSubmitNew={handleSubmitNew}
        pickPending={linkItem.isPending}
        submitPending={addAndLink.isPending}
        pickErrorMessage={linkItem.error?.message}
        submitErrorMessage={addAndLink.error?.message}
        onCancel={onClose}
      />
    </Modal>
  )
}
