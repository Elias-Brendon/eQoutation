import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Textarea } from '@renderer/components/common/Textarea'
import { Button } from '@renderer/components/common/Button'

export type QuotationActionMode = 'approve' | 'reject' | 'comment'

interface QuotationActionModalProps {
  open: boolean
  mode: QuotationActionMode
  onClose: () => void
  onSubmit: (comment: string) => void
  isSubmitting?: boolean
}

const modeCopy: Record<
  QuotationActionMode,
  {
    title: string
    placeholder: string
    confirmLabel: string
    variant: 'success' | 'danger' | 'outline'
    requireComment: boolean
  }
> = {
  approve: {
    title: 'Approve quotation',
    placeholder: 'Optional comment…',
    confirmLabel: 'Approve',
    variant: 'success',
    requireComment: false
  },
  reject: {
    title: 'Reject quotation',
    placeholder: 'Reason for rejection (optional)…',
    confirmLabel: 'Reject',
    variant: 'danger',
    requireComment: false
  },
  comment: {
    title: 'Add comment',
    placeholder: 'Write a comment…',
    confirmLabel: 'Add comment',
    variant: 'outline',
    requireComment: true
  }
}

export function QuotationActionModal({
  open,
  mode,
  onClose,
  onSubmit,
  isSubmitting
}: QuotationActionModalProps): React.JSX.Element {
  const [comment, setComment] = useState('')
  const copy = modeCopy[mode]

  const handleClose = (): void => {
    setComment('')
    onClose()
  }

  const handleSubmit = (): void => {
    onSubmit(comment.trim())
    setComment('')
  }

  return (
    <Modal open={open} onClose={handleClose} title={copy.title}>
      <Textarea
        rows={4}
        placeholder={copy.placeholder}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        autoFocus
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant={copy.variant}
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || (copy.requireComment && comment.trim().length === 0)}
        >
          {copy.confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
