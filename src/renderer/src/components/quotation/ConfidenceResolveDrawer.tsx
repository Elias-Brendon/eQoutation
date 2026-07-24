import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { Drawer } from '@renderer/components/common/Drawer'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { Badge } from '@renderer/components/common/Badge'
import { useSettings } from '@renderer/state/queries/useSettings'
import { useResolveFeedback } from '@renderer/state/queries/useFeedback'
import type { QuotationLine } from '@shared/types/entities'

interface ConfidenceResolveDrawerProps {
  open: boolean
  onClose: () => void
  flagId: string | null
  quotationId: string
  sldId: string
  projectId: string
  line: QuotationLine
  onFocusLine?: (pageNumber: number) => void
}

function confidenceTone(confidence: number, threshold: number): 'danger' | 'warning' | 'success' {
  if (confidence < threshold * 0.5) return 'danger'
  if (confidence < threshold) return 'warning'
  return 'success'
}

export function ConfidenceResolveDrawer({
  open,
  onClose,
  flagId,
  quotationId,
  sldId,
  projectId,
  line,
  onFocusLine
}: ConfidenceResolveDrawerProps): React.JSX.Element {
  const { data: settings } = useSettings()
  const threshold = settings?.confidenceThreshold ?? 0.7
  const resolveFeedback = useResolveFeedback()

  const [description, setDescription] = useState(line.description)
  const [qty, setQty] = useState(line.qty.toString())
  const [uom, setUom] = useState(line.uom)
  const [tag, setTag] = useState(line.tag)

  const ctx = { flagId, quotationId, sldId, projectId, lineId: line.id }

  const handleAccept = (): void => {
    resolveFeedback.mutate({ ...ctx, action: 'accepted' }, { onSuccess: onClose })
  }

  const handleOverride = (): void => {
    const parsedQty = Number(qty)
    resolveFeedback.mutate(
      {
        ...ctx,
        action: 'corrected',
        fields: {
          description: description.trim(),
          qty: Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : line.qty,
          uom: uom.trim(),
          tag: tag.trim()
        }
      },
      { onSuccess: onClose }
    )
  }

  const handleFlagForLater = (): void => {
    resolveFeedback.mutate({ ...ctx, action: 'flagged_for_later' }, { onSuccess: onClose })
  }

  return (
    <Drawer open={open} onClose={onClose} title="Review low-confidence extraction">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">AI confidence</span>
          <Badge tone={confidenceTone(line.aiConfidence, threshold)}>
            {(line.aiConfidence * 100).toFixed(0)}%
          </Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onFocusLine?.(line.pageNumber)}
          className="self-start"
        >
          <MapPin className="h-3.5 w-3.5" />
          Jump to page {line.pageNumber}
        </Button>

        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Qty">
            <Input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field label="UOM">
            <Input value={uom} onChange={(e) => setUom(e.target.value)} />
          </Field>
        </div>
        <Field label="Tag">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} />
        </Field>

        {resolveFeedback.isError && (
          <div className="text-xs text-danger">{resolveFeedback.error.message}</div>
        )}

        <div className="mt-2 flex flex-col gap-2">
          <Button
            variant="accent"
            size="sm"
            onClick={handleOverride}
            disabled={resolveFeedback.isPending}
          >
            Override with corrected values
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={handleAccept}
            disabled={resolveFeedback.isPending}
          >
            Accept as-is
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFlagForLater}
            disabled={resolveFeedback.isPending}
          >
            Flag for later
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      {children}
    </label>
  )
}
