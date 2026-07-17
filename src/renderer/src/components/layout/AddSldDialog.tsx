import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useUploadSld } from '@renderer/state/queries/useSlds'

interface AddSldDialogProps {
  open: boolean
  projectId: string
  onClose: () => void
}

export function AddSldDialog({ open, projectId, onClose }: AddSldDialogProps): React.JSX.Element {
  const [sectionGroup, setSectionGroup] = useState('')
  const uploadSld = useUploadSld()

  const handleChoosePdf = async (): Promise<void> => {
    await uploadSld.mutateAsync({ projectId, sectionGroup: sectionGroup.trim() })
    setSectionGroup('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add SLD entry">
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Section group (optional)</label>
          <Input
            autoFocus
            value={sectionGroup}
            onChange={(e) => setSectionGroup(e.target.value)}
            placeholder="Substation A — Phase 2"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={handleChoosePdf}
            disabled={uploadSld.isPending}
          >
            <FileUp className="h-3.5 w-3.5" />
            Choose PDF…
          </Button>
        </div>
      </div>
    </Modal>
  )
}
