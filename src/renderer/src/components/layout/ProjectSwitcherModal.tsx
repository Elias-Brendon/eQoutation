import { Check } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Badge } from '@renderer/components/common/Badge'
import { cn } from '@renderer/lib/cn'
import type { Project } from '@shared/types/entities'

interface ProjectSwitcherModalProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (projectId: string) => void
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function ProjectSwitcherModal({
  open,
  onClose,
  projects,
  selectedProjectId,
  onSelectProject
}: ProjectSwitcherModalProps): React.JSX.Element {
  const handleSelect = (projectId: string): void => {
    if (projectId !== selectedProjectId) onSelectProject(projectId)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Switch project" className="w-[480px] max-w-[90vw]">
      <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
        {projects.length === 0 && (
          <p className="py-4 text-center text-xs text-text-muted">No projects yet.</p>
        )}
        {projects.map((project) => {
          const isActive = project.id === selectedProjectId
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => handleSelect(project.id)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface hover:bg-surface-hover'
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{project.name}</div>
                {project.substationLabel && (
                  <div className="truncate text-xs text-text-muted">{project.substationLabel}</div>
                )}
                <div className="mt-0.5 text-[11px] text-text-muted">
                  Created {formatCreatedAt(project.createdAt)}
                </div>
              </div>
              {isActive && (
                <Badge tone="info" className="shrink-0">
                  <Check className="h-3 w-3" />
                  Active
                </Badge>
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
