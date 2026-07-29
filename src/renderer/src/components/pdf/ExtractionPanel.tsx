import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { Badge } from '@renderer/components/common/Badge'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useUiStore } from '@renderer/state/useUiStore'
import { useExtractSld, useExtraction } from '@renderer/state/queries/useExtraction'

interface ExtractionPanelProps {
  sldId: string
}

export function ExtractionPanel({ sldId }: ExtractionPanelProps): React.JSX.Element {
  const { data: extraction } = useExtraction(sldId)
  const extractSld = useExtractSld()
  const liveProgress = useUiStore((s) =>
    s.extractionProgress?.sldId === sldId ? s.extractionProgress : null
  )

  const running = extraction?.status === 'running' || extractSld.isPending
  const pct = liveProgress?.pct ?? (running ? 5 : 0)
  const stage = liveProgress?.stage ?? (running ? 'Starting…' : '')

  const handleGenerate = (): void => {
    extractSld.mutate(sldId)
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          AI extraction
          {extraction && extraction.status === 'done' && (
            <Badge tone="success">{extraction.components.length} components</Badge>
          )}
          {extraction?.status === 'error' && <Badge tone="danger">Failed</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={running}>
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {extraction ? 'Re-run' : 'Generate'}
        </Button>
      </div>

      {running && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-32 shrink-0 font-mono text-[11px] text-text-muted">{stage}</span>
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
