import { useEffect, useState } from 'react'
import { Archive, Database, Flag, Loader2, Plus, Upload, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@renderer/components/animation/Logo'
import { Button } from '@renderer/components/common/Button'
import { useUpdateProjectCurrency } from '@renderer/state/queries/useProjects'
import type { ExtractionProgressEvent, Project } from '@shared/types/entities'

interface TopBarProps {
  project: Project | null
  matcherFlagCount: number
  aiFlagCount: number
  manualFlagCount: number
  extractionProgress: ExtractionProgressEvent | null
  username: string | null
  onUploadClick: () => void
  onNewProject: () => void
  onOpenCatalog: () => void
  onExportProject: () => void
  exportPending: boolean
  onOpenSettings: () => void
}

export function TopBar({
  project,
  matcherFlagCount,
  aiFlagCount,
  manualFlagCount,
  extractionProgress,
  username,
  onUploadClick,
  onNewProject,
  onOpenCatalog,
  onExportProject,
  exportPending,
  onOpenSettings
}: TopBarProps): React.JSX.Element {
  const progressPct = extractionProgress?.pct ?? project?.aiProgressPct ?? 0
  const progressLabel = extractionProgress
    ? `${extractionProgress.stage.toUpperCase()}`
    : 'AI GENERATION'
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

      {project && <CurrencyField project={project} />}

      <div className="ml-4 flex flex-1 items-center gap-3">
        {project && (
          <>
            <span className="shrink-0 font-mono text-[11px] tracking-wider text-text-muted">
              {progressLabel}
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-raised">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs text-accent">{progressPct}%</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <FlagBadge tone="text-warning" count={matcherFlagCount} label="Matcher" />
        <FlagBadge tone="text-danger" count={aiFlagCount} label="AI" />
        <FlagBadge tone="text-warning" count={manualFlagCount} label="Manual" />
      </div>

      <Button variant="outline" size="md" onClick={onOpenCatalog} title="Browse catalog">
        <Database className="h-4 w-4" />
        Catalog
      </Button>

      <Button
        variant="outline"
        size="md"
        onClick={onExportProject}
        disabled={!project || exportPending}
        title={project ? 'Export project bundle (SLDs + quotations + manifest)' : undefined}
      >
        {exportPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        Export project
      </Button>

      <Button variant="outline" size="md" onClick={onNewProject}>
        <Plus className="h-4 w-4" />
        New Project
      </Button>

      <Button variant="accent" size="md" onClick={onUploadClick} disabled={!project}>
        <Upload className="h-4 w-4" />
        Upload PDF
      </Button>

      <Button
        variant="ghost"
        size="md"
        onClick={onOpenSettings}
        title="Open settings"
        className="max-w-32"
      >
        <User className="h-4 w-4 shrink-0" />
        <span className="truncate">{username ?? 'Account'}</span>
      </Button>
    </header>
  )
}

function CurrencyField({ project }: { project: Project }): React.JSX.Element {
  const [value, setValue] = useState(project.currency)
  const updateCurrency = useUpdateProjectCurrency()

  useEffect(() => {
    setValue(project.currency)
  }, [project.id, project.currency])

  const commit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === project.currency) {
      setValue(project.currency)
      return
    }
    updateCurrency.mutate({ projectId: project.id, currency: trimmed })
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      title="Currency symbol used in this project's quotations"
    >
      <span className="font-mono text-[11px] tracking-wider text-text-muted">CURRENCY</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        maxLength={5}
        className="h-7 w-14 rounded border border-border-strong bg-surface px-1.5 text-center text-xs text-text-primary focus:border-accent focus:outline-none"
      />
    </div>
  )
}

interface FlagBadgeProps {
  tone: string
  count: number
  label: string
}

function FlagBadge({ tone, count, label }: FlagBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      <Flag className="h-3 w-3" />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={count}
          initial={{ scale: 1.4, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {count}
        </motion.span>
      </AnimatePresence>
      {label}
    </span>
  )
}
