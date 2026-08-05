import { Check, Trash2 } from 'lucide-react'
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
  onDeleteProject: (project: Project) => void
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
  onSelectProject,
  onDeleteProject
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
            <div
              key={project.id}
              onClick={() => handleSelect(project.id)}
              className={cn(
                'group flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors',
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
              <div className="flex shrink-0 items-center gap-2">
                {isActive && (
                  <Badge tone="info">
                    <Check className="h-3 w-3" />
                    Active
                  </Badge>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteProject(project)
                  }}
                  title="Delete project"
                  className="rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger-bg hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
