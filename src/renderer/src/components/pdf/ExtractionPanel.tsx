import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { Badge } from '@renderer/components/common/Badge'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useExtractSld, useExtraction } from '@renderer/state/queries/useExtraction'
import { useSettings } from '@renderer/state/queries/useSettings'
import { useUpdateProjectAiModelOverride } from '@renderer/state/queries/useProjects'
import { AVAILABLE_AI_MODELS } from '@shared/constants/aiModels'
import type { Project } from '@shared/types/entities'

interface ExtractionPanelProps {
  sldId: string
  project: Project | null
}

export function ExtractionPanel({ sldId, project }: ExtractionPanelProps): React.JSX.Element {
  const { data: extraction } = useExtraction(sldId)
  const extractSld = useExtractSld()
  const { data: settings } = useSettings()
  const updateAiModelOverride = useUpdateProjectAiModelOverride()
  const globalModelLabel =
    AVAILABLE_AI_MODELS.find((m) => m.id === settings?.aiModel)?.label ?? settings?.aiModel ?? '—'

  const running = extraction?.status === 'running' || extractSld.isPending

  const alreadyExtracted = extraction?.status === 'done'

  const handleGenerate = (): void => {
    if (alreadyExtracted) {
      const confirmed = window.confirm(
        'This SLD was already extracted. Re-running will call the AI again and use additional tokens. Continue?'
      )
      if (!confirmed) return
      extractSld.mutate({ sldId, force: true })
      return
    }
    extractSld.mutate({ sldId })
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          AI extraction
          {extraction && extraction.status === 'done' && (
            <>
              <Badge tone="success">{extraction.components.length} components</Badge>
              {extraction.inputTokens !== null && extraction.outputTokens !== null && (
                <Badge tone="neutral">
                  {formatTokenCount(extraction.inputTokens)} in /{' '}
                  {formatTokenCount(extraction.outputTokens)} out
                </Badge>
              )}
            </>
          )}
          {extraction?.status === 'error' && <Badge tone="danger">Failed</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={running}>
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {alreadyExtracted ? 'Re-extract…' : extraction ? 'Re-run' : 'Generate'}
        </Button>
      </div>

      {project && (
        <div className="flex items-center gap-2 text-xs">
          <label className="text-text-muted" htmlFor={`ai-model-override-${project.id}`}>
            Project AI model (applies to every SLD in this project)
          </label>
          <select
            id={`ai-model-override-${project.id}`}
            value={project.aiModelOverride ?? ''}
            onChange={(e) =>
              updateAiModelOverride.mutate({
                projectId: project.id,
                aiModelOverride: e.target.value === '' ? null : e.target.value
              })
            }
            className="h-7 rounded border border-border-strong bg-surface px-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Use global default (currently: {globalModelLabel})</option>
            {AVAILABLE_AI_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {extraction?.status === 'error' && (
        <div className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger-bg px-2.5 py-1.5 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <ErrorMessage message={extraction.error ?? 'Extraction failed.'} />
        </div>
      )}

      {extraction?.status === 'done' && (
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
          {extraction.flags.length > 0 && (
            <div className="flex flex-col gap-1">
              {extraction.flags.map((flag, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning-bg px-2.5 py-1 text-xs text-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    <span className="font-mono text-[11px] opacity-70">p{flag.pageNumber}</span>{' '}
                    {flag.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Page</th>
                <th className="px-2 py-1 font-medium">Description</th>
                <th className="px-2 py-1 font-medium">Qty</th>
                <th className="px-2 py-1 font-medium">Tag</th>
                <th className="px-2 py-1 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {extraction.components.map((c, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-2 py-1 text-text-secondary">{c.pageNumber}</td>
                  <td className="px-2 py-1 text-text-primary">
                    {c.description}
                    {c.notes && <div className="text-[11px] text-text-muted">{c.notes}</div>}
                  </td>
                  <td className="px-2 py-1 text-text-secondary">
                    {c.qty} {c.uom}
                  </td>
                  <td className="px-2 py-1 font-mono text-text-secondary">{c.tag}</td>
                  <td className="px-2 py-1 text-text-secondary">
                    {Math.round(c.confidence * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatTokenCount(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}K`
}
