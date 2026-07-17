import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useCreateSld } from '@renderer/state/queries/useSlds'

interface AddSldDialogProps {
  open: boolean
  projectId: string
  onClose: () => void
}

export function AddSldDialog({ open, projectId, onClose }: AddSldDialogProps): React.JSX.Element {
  const [filename, setFilename] = useState('')
  const [sectionGroup, setSectionGroup] = useState('')
  const createSld = useCreateSld()

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!filename.trim()) return
    await createSld.mutateAsync({
      projectId,
      filename: filename.trim(),
      sectionGroup: sectionGroup.trim()
    })
    setFilename('')
    setSectionGroup('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add SLD entry">
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Filename</label>
          <Input
            autoFocus
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="SLD-014.pdf"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Section group (optional)</label>
          <Input
            value={sectionGroup}
            onChange={(e) => setSectionGroup(e.target.value)}
            placeholder="Substation A — Phase 2"
          />
        </div>
        <p className="text-xs text-text-muted">
          Metadata only for now — real PDF upload is wired in Stage 3.
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            disabled={!filename.trim() || createSld.isPending}
          >
            Add
          </Button>
        </div>
      </form>
    </Modal>
  )
}
