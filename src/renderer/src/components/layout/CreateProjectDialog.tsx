import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useCreateProject } from '@renderer/state/queries/useProjects'
import { useSettings } from '@renderer/state/queries/useSettings'

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => void
  currentUsername: string | null
}

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  currentUsername
}: CreateProjectDialogProps): React.JSX.Element {
  const { data: settings } = useSettings()
  const [name, setName] = useState('')
  const [substationLabel, setSubstationLabel] = useState('')
  const [sector, setSector] = useState('')
  const [company, setCompany] = useState('')
  const [coordinator, setCoordinator] = useState(currentUsername ?? '')
  const createProject = useCreateProject()

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) return
    const project = await createProject.mutateAsync({
      name: name.trim(),
      substationLabel: substationLabel.trim(),
      sector: sector || undefined,
      company: company || undefined,
      coordinator: coordinator.trim() || undefined
    })
    setName('')
    setSubstationLabel('')
    setSector('')
    setCompany('')
    setCoordinator(currentUsername ?? '')
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
        <div>
          <label className="mb-1 block text-xs text-text-muted">Sector (optional)</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {(settings?.projectSectors ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Company (optional)</label>
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {(settings?.companies ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Coordinator (optional)</label>
          <Input
            value={coordinator}
            onChange={(e) => setCoordinator(e.target.value)}
            placeholder="Coordinator name"
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
