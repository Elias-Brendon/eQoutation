import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useCreateProject } from '@renderer/state/queries/useProjects'

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => void
}

export function CreateProjectDialog({
  open,
  onClose,
  onCreated
}: CreateProjectDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [substationLabel, setSubstationLabel] = useState('')
  const createProject = useCreateProject()

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) return
    const project = await createProject.mutateAsync({
      name: name.trim(),
      substationLabel: substationLabel.trim()
    })
    setName('')
    setSubstationLabel('')
    onCreated(project.id)
  }

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Project name</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Substation A — Phase 2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Label (optional)</label>
          <Input
            value={substationLabel}
            onChange={(e) => setSubstationLabel(e.target.value)}
            placeholder="Line Diagram Review"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            disabled={!name.trim() || createProject.isPending}
          >
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}
