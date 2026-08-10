import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

// Renders in-app instead of calling window.confirm() — Electron's native
// confirm dialog leaves the renderer's focused input unable to receive
// keystrokes afterward (caret shows but typing does nothing) until the
// window is refocused, which reads to users as "the search box is broken".
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Remove',
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="whitespace-pre-line text-sm text-text-secondary">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
