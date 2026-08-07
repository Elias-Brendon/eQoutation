import { useEffect, useState } from 'react'
import {
  Archive,
  Database,
  Download,
  Flag,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  User,
  X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@renderer/components/animation/Logo'
import { Button } from '@renderer/components/common/Button'
import { DotmSquare2 } from '@renderer/components/ui/dotm-square-2'
import { cn } from '@renderer/lib/cn'
import { pctToDotmSpeed } from '@renderer/lib/extractionAnimationSpeed'
import { useUpdateProjectCurrencySettings } from '@renderer/state/queries/useProjects'
import { useFxRate } from '@renderer/state/queries/useFx'
import { useProjectTokenUsage } from '@renderer/state/queries/useAiUsage'
import { useUpdateCheck, useUpdateInstall } from '@renderer/state/queries/useApp'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
import { CURRENCIES } from '@shared/constants/currencies'
import type { ExtractionProgressEvent, Project } from '@shared/types/entities'

interface TopBarProps {
  project: Project | null
  matcherFlagCount: number
  aiFlagCount: number
  manualFlagCount: number
  extractionProgress: ExtractionProgressEvent | null
  username: string | null
  // Below the app's narrow-window breakpoint — drops button text labels
  // (icon + tooltip only) so the bar never pushes controls off-window.
  compact: boolean
  onUploadClick: () => void
  onNewProject: () => void
  onOpenCatalog: () => void
  onExportProject: () => void
  exportPending: boolean
  onOpenSettings: () => void
  onOpenProjectSwitcher: () => void
  onOpenProjectDetails: () => void
}

export function TopBar({
  project,
  matcherFlagCount,
  aiFlagCount,
  manualFlagCount,
  extractionProgress,
  username,
  compact,
  onUploadClick,
  onNewProject,
  onOpenCatalog,
  onExportProject,
  exportPending,
  onOpenSettings,
  onOpenProjectSwitcher,
  onOpenProjectDetails
}: TopBarProps): React.JSX.Element {
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-border bg-surface px-5">
      <Logo />

      <div className="h-6 w-px bg-border" />

      {project ? (
        <button
          type="button"
          onClick={onOpenProjectSwitcher}
          title="Switch project"
          className="-mx-1 min-w-16 rounded px-1 text-left transition-colors hover:bg-surface-hover"
        >
          <div className="truncate text-sm font-semibold text-text-primary">{project.name}</div>
          <div className="truncate text-xs text-text-muted">{project.substationLabel}</div>
        </button>
      ) : (
        <div className="text-sm text-text-muted">No project yet</div>
      )}

      {project && <CurrencyField project={project} compact={compact} />}
      {project && <TokenUsageBadge projectId={project.id} />}

      <div className="ml-4 flex min-w-0 flex-1 items-center gap-3">
        {project && extractionProgress && (
          <>
            <DotmSquare2
              animated
              speed={pctToDotmSpeed(extractionProgress.pct)}
              size={20}
              dotSize={3}
              className="shrink-0 text-accent"
            />
            <span
              className="min-w-0 truncate font-mono text-[11px] tracking-wider text-text-muted"
              title={extractionProgress.stage.toUpperCase()}
            >
              {extractionProgress.stage.toUpperCase()}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <FlagBadge tone="text-warning" count={matcherFlagCount} label="Matcher" compact={compact} />
        <FlagBadge tone="text-danger" count={aiFlagCount} label="AI" compact={compact} />
        <FlagBadge tone="text-warning" count={manualFlagCount} label="Manual" compact={compact} />
        <UpdateNotice />
      </div>

      <Button
        variant="outline"
        size="md"
        onClick={onOpenCatalog}
        title="Browse catalog"
        aria-label="Browse catalog"
      >
        <Database className="h-4 w-4" />
        {!compact && 'Catalog'}
      </Button>

      <Button
        variant="outline"
        size="md"
        onClick={onOpenProjectDetails}
        disabled={!project}
        title={project ? 'View project details' : undefined}
        aria-label="Project details"
      >
        <Info className="h-4 w-4" />
        {!compact && 'Details'}
      </Button>

      <Button
        variant="outline"
        size="md"
        onClick={onExportProject}
        disabled={!project || exportPending}
        title={
          project ? 'Export project bundle (SLDs + quotations + manifest) — Ctrl+E' : undefined
        }
        aria-label="Export project"
      >
        {exportPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        {!compact && 'Export project'}
      </Button>

      <Button
        variant="outline"
        size="md"
        onClick={onNewProject}
        title="New project — Ctrl+Shift+N"
        aria-label="New project"
      >
        <Plus className="h-4 w-4" />
        {!compact && 'New Project'}
      </Button>

      <Button
        variant="accent"
        size="md"
        onClick={onUploadClick}
        disabled={!project}
        title="Upload PDF — Ctrl+U"
        aria-label="Upload PDF"
      >
        <Upload className="h-4 w-4" />
        {!compact && 'Upload PDF'}
      </Button>

      <Button
        variant="ghost"
        size="md"
        onClick={onOpenSettings}
        title="Open settings"
        aria-label="Open settings"
        className="max-w-32"
      >
        <User className="h-4 w-4 shrink-0" />
        {!compact && <span className="truncate">{username ?? 'Account'}</span>}
      </Button>
    </header>
  )
}

function CurrencyField({
  project,
  compact
}: {
  project: Project
  compact: boolean
}): React.JSX.Element {
  const updateCurrencySettings = useUpdateProjectCurrencySettings()
  const fetchRate = useFxRate()
  const [rateInput, setRateInput] = useState(project.exchangeRate.toString())
  const isMyr = project.currency === 'MYR'

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the editable input to the server value when the underlying project/rate changes, not a render-cascade risk
    setRateInput(project.exchangeRate.toString())
  }, [project.id, project.exchangeRate])

  const handleCurrencyChange = (newCurrency: string): void => {
    if (newCurrency === 'MYR') {
      updateCurrencySettings.mutate({
        projectId: project.id,
        currency: 'MYR',
        exchangeRate: 1,
        exchangeRateIsManual: false
      })
      return
    }
    // Switching currency: fetch a rate (served from the once-a-day cache if
    // already fetched today) as the starting point. If that fails (offline),
    // still switch currency with a rate of 1 so the UI never dead-ends — the
    // user can type a manual rate.
    fetchRate.mutate(
      { targetCurrency: newCurrency },
      {
        onSuccess: (result) => {
          updateCurrencySettings.mutate({
            projectId: project.id,
            currency: newCurrency,
            exchangeRate: result.rate,
            exchangeRateIsManual: false
          })
        },
        onError: () => {
          updateCurrencySettings.mutate({
            projectId: project.id,
            currency: newCurrency,
            exchangeRate: 1,
            exchangeRateIsManual: false
          })
        }
      }
    )
  }

  const handleRefresh = (): void => {
    fetchRate.mutate(
      { targetCurrency: project.currency, forceRefresh: true },
      {
        onSuccess: (result) => {
          updateCurrencySettings.mutate({
            projectId: project.id,
            currency: project.currency,
            exchangeRate: result.rate,
            exchangeRateIsManual: false
          })
          setRateInput(result.rate.toString())
        }
      }
    )
  }

  const commitManualRate = (): void => {
    const parsed = Number(rateInput)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === project.exchangeRate) {
      setRateInput(project.exchangeRate.toString())
      return
    }
    updateCurrencySettings.mutate({
      projectId: project.id,
      currency: project.currency,
      exchangeRate: parsed,
      exchangeRateIsManual: true
    })
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      title="Currency and exchange rate used in this project's quotations (base: MYR)"
    >
      {!compact && (
        <span className="font-mono text-[11px] tracking-wider text-text-muted">CURRENCY</span>
      )}
      <select
        value={project.currency}
        onChange={(e) => handleCurrencyChange(e.target.value)}
        className="h-7 rounded border border-border-strong bg-surface px-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code}
          </option>
        ))}
      </select>
      {!isMyr && (
        <>
          <input
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={commitManualRate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            title={
              project.exchangeRateIsManual
                ? 'Manual rate override — click refresh to use the live rate again'
                : 'Rate from Frankfurter, cached once a day — edit to override manually'
            }
            className="h-7 w-16 rounded border border-border-strong bg-surface px-1.5 text-center text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={fetchRate.isPending}
            title="Refresh live rate (overrides manual entry)"
          >
            <RefreshCw className={cn('h-3 w-3', fetchRate.isPending && 'animate-spin')} />
          </Button>
          {project.exchangeRateIsManual && (
            <span className="text-[10px] text-text-muted" title="Manual rate in effect">
              manual
            </span>
          )}
          {fetchRate.isError && (
            <span className="text-[10px] text-danger" title={fetchRate.error.message}>
              fetch failed
            </span>
          )}
        </>
      )}
    </div>
  )
}

function TokenUsageBadge({ projectId }: { projectId: string }): React.JSX.Element | null {
  const { data: usage } = useProjectTokenUsage(projectId)
  if (!usage || usage.extractionCount === 0) return null

  const total = usage.totalInputTokens + usage.totalOutputTokens
  const label = total < 1000 ? String(total) : `${(total / 1000).toFixed(1)}K`

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary"
      title={`${usage.totalInputTokens.toLocaleString()} input / ${usage.totalOutputTokens.toLocaleString()} output tokens across ${usage.extractionCount} extraction(s)`}
    >
      {label} tokens
    </span>
  )
}

interface FlagBadgeProps {
  tone: string
  count: number
  label: string
  compact: boolean
}

function FlagBadge({ tone, count, label, compact }: FlagBadgeProps): React.JSX.Element {
  return (
    <span
      title={compact ? `${label}: ${count}` : undefined}
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
      {!compact && label}
    </span>
  )
}

function UpdateNotice(): React.JSX.Element | null {
  const { data: status } = useUpdateCheck()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { isDownloading, didFail, percent, startUpdate } = useUpdateInstall()

  if (!status?.isNewer) return null
  const dismissed = settings?.dismissedUpdateVersion === status.latestVersion
  if (dismissed && !isDownloading && !didFail) return null

  if (isDownloading) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent">
        <Download className="h-3 w-3" />
        Downloading… {percent ?? 0}%
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent">
      <Download className="h-3 w-3" />
      <button
        type="button"
        onClick={() => startUpdate(status.latestVersion)}
        title={`Download and install v${status.latestVersion}`}
        className="hover:underline"
      >
        {didFail ? 'Update failed — retry' : `v${status.latestVersion} available`}
      </button>
      <button
        type="button"
        onClick={() => updateSettings.mutate({ dismissedUpdateVersion: status.latestVersion })}
        title="Dismiss until the next update"
        aria-label="Dismiss update notice"
        className="text-accent/70 hover:text-accent"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
