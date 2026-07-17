import { Flag, Plus, Upload } from 'lucide-react'
import { motion } from 'framer-motion'
import { Logo } from '@renderer/components/animation/Logo'
import { Button } from '@renderer/components/common/Button'
import type { Project } from '@shared/types/entities'

interface TopBarProps {
  project: Project | null
  aiFlagCount: number
  manualFlagCount: number
  onUploadClick: () => void
  onNewProject: () => void
}

export function TopBar({
  project,
  aiFlagCount,
  manualFlagCount,
  onUploadClick,
  onNewProject
}: TopBarProps): React.JSX.Element {
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-border bg-surface px-5">
      <Logo />

      <div className="h-6 w-px bg-border" />

      {project ? (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary">{project.name}</div>
          <div className="truncate text-xs text-text-muted">{project.substationLabel}</div>
        </div>
      ) : (
        <div className="text-sm text-text-muted">No project yet</div>
      )}

      <div className="ml-4 flex flex-1 items-center gap-3">
        {project && (
          <>
            <span className="shrink-0 font-mono text-[11px] tracking-wider text-text-muted">
              AI GENERATION
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-raised">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${project.aiProgressPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs text-accent">{project.aiProgressPct}%</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-danger">
          <Flag className="h-3 w-3" />
          {aiFlagCount} AI
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-warning">
          <Flag className="h-3 w-3" />
          {manualFlagCount} Manual
        </span>
      </div>

      <Button variant="outline" size="md" onClick={onNewProject}>
        <Plus className="h-4 w-4" />
        New Project
      </Button>

      <Button variant="accent" size="md" onClick={onUploadClick} disabled={!project}>
        <Upload className="h-4 w-4" />
        Upload PDF
      </Button>
    </header>
  )
}
