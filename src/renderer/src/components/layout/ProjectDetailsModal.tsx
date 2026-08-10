import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { useSettings } from '@renderer/state/queries/useSettings'
import { useUpdateProjectDetails } from '@renderer/state/queries/useProjects'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@shared/constants/projectStatus'
import type { Project, ProjectStatus } from '@shared/types/entities'

interface ProjectDetailsModalProps {
  open: boolean
  onClose: () => void
  project: Project | null
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-muted">{label}</label>
      {children}
    </div>
  )
}

const selectClassName =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none'

export function ProjectDetailsModal({
  open,
  onClose,
  project
}: ProjectDetailsModalProps): React.JSX.Element | null {
  const { data: settings } = useSettings()
  const updateDetails = useUpdateProjectDetails()

  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [coordinator, setCoordinator] = useState('')

  useEffect(() => {
    if (!project) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the editable fields to the server value when the selected project changes, not a render-cascade risk
    setName(project.name)
    setLabel(project.substationLabel)
    setCoordinator(project.coordinator ?? '')
  }, [project?.id, project?.name, project?.substationLabel, project?.coordinator])

  if (!project) return null

  const commitName = (): void => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) {
      setName(project.name)
      return
    }
    updateDetails.mutate({ projectId: project.id, name: trimmed })
  }

  const commitLabel = (): void => {
    const trimmed = label.trim()
    if (trimmed === project.substationLabel) return
    updateDetails.mutate({ projectId: project.id, substationLabel: trimmed })
  }

  const commitCoordinator = (): void => {
    const currentValue = project.coordinator ?? ''
    if (coordinator === currentValue) return
    updateDetails.mutate({ projectId: project.id, coordinator: coordinator.trim() || null })
  }

  return (
    <Modal open={open} onClose={onClose} title="Project Details" className="w-[440px] max-w-[90vw]">
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </Field>

        <Field label="Label (optional)">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </Field>

        <Field label="Sector">
          <select
            value={project.sector ?? ''}
            onChange={(e) =>
              updateDetails.mutate({ projectId: project.id, sector: e.target.value || null })
            }
            className={selectClassName}
          >
            <option value="">—</option>
            {(settings?.projectSectors ?? []).map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quotation #">
          <div className="flex h-9 items-center font-mono text-sm text-text-secondary">
            {project.quotationNumber}
          </div>
        </Field>

        <Field label="Company">
          <select
            value={project.company ?? ''}
            onChange={(e) =>
              updateDetails.mutate({ projectId: project.id, company: e.target.value || null })
            }
            className={selectClassName}
          >
            <option value="">—</option>
            {(settings?.companies ?? []).map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Coordinator">
          <Input
            value={coordinator}
            onChange={(e) => setCoordinator(e.target.value)}
            onBlur={commitCoordinator}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </Field>

        <Field label="Status">
          <select
            value={project.status}
            onChange={(e) =>
              updateDetails.mutate({
                projectId: project.id,
                status: e.target.value as ProjectStatus
              })
            }
            className={selectClassName}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Enquiry Date">
          <div className="flex h-9 items-center text-sm text-text-secondary">
            {new Date(project.createdAt).toLocaleDateString()}
          </div>
        </Field>

        <Field label="Created by">
          <div className="flex h-9 items-center text-sm text-text-secondary">
            {project.createdBy ?? '—'}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
