import { useState } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Badge } from '@renderer/components/common/Badge'
import { Button } from '@renderer/components/common/Button'
import { Textarea } from '@renderer/components/common/Textarea'
import { CatalogResolveModal } from '@renderer/components/quotation/CatalogResolveModal'
import {
  useFlagsByQuotation,
  useRaiseFlag,
  useResolveFlag,
  useResolveUnmatchedLine
} from '@renderer/state/queries/useFlags'
import { flagOriginMeta, flagSeverityMeta } from '@renderer/lib/statusMeta'
import type { Flag, FlagSeverity, QuotationLine } from '@shared/types/entities'

interface FlagsPanelProps {
  open: boolean
  onClose: () => void
  quotationId: string
  sldId: string
  projectId: string
  lines: QuotationLine[]
  onFocusFlag: (flagId: string) => void
}

export function FlagsPanel({
  open,
  onClose,
  quotationId,
  sldId,
  projectId,
  lines,
  onFocusFlag
}: FlagsPanelProps): React.JSX.Element {
  const { data: flags = [] } = useFlagsByQuotation(quotationId)
  const raiseFlag = useRaiseFlag()
  const resolveFlag = useResolveFlag()
  const resolveUnmatchedLine = useResolveUnmatchedLine()

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [newFlagMessage, setNewFlagMessage] = useState('')
  const [newFlagSeverity, setNewFlagSeverity] = useState<FlagSeverity>('warning')
  const [catalogResolveFlag, setCatalogResolveFlag] = useState<{
    flag: Flag
    line: QuotationLine
  } | null>(null)

  const openFlags = flags.filter((f) => f.status === 'open')
  const resolvedFlags = flags.filter((f) => f.status === 'resolved')

  const lineForFlag = (flag: Flag): QuotationLine | undefined =>
    flag.quotationLineId ? lines.find((l) => l.id === flag.quotationLineId) : undefined

  const handleResolve = (
    flag: Flag,
    outcome?: { action: 'accepted' | 'corrected'; value: string }
  ): void => {
    resolveFlag.mutate(
      {
        id: flag.id,
        resolutionNote: resolutionNote.trim() || undefined,
        outcome,
        quotationId,
        projectId
      },
      {
        onSuccess: () => {
          setResolvingId(null)
          setResolutionNote('')
        }
      }
    )
  }

  // Unmatched-item flags get a real catalog check instead of a plain note:
  // silently re-run the matcher first (catches items added earlier in this
  // same batch), and only fall back to the search/add modal if that misses.
  const handleResolveUnmatchedLine = (flag: Flag, line: QuotationLine): void => {
    resolveUnmatchedLine.mutate(
      { flagId: flag.id, quotationId, sldId, projectId },
      {
        onSuccess: (result) => {
          if (!result.matched) setCatalogResolveFlag({ flag, line })
        }
      }
    )
  }

  const handleRaise = (): void => {
    if (newFlagMessage.trim().length === 0) return
    raiseFlag.mutate(
      { quotationId, message: newFlagMessage.trim(), severity: newFlagSeverity, projectId },
      { onSuccess: () => setNewFlagMessage('') }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Flags" className="w-[28rem]">
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {openFlags.length === 0 && resolvedFlags.length === 0 && (
          <p className="text-sm text-text-muted">No flags on this quotation.</p>
        )}
        {openFlags.map((flag) => {
          const line = lineForFlag(flag)
          const isUnmatchedLineFlag = !!line && line.matchStatus === 'unknown'
          const isChecking =
            resolveUnmatchedLine.isPending && resolveUnmatchedLine.variables?.flagId === flag.id

          return (
            <div key={flag.id} className="rounded-md border border-border-strong p-2">
              <div className="flex items-center gap-2">
                <Badge tone={flagOriginMeta[flag.origin].tone}>
                  {flagOriginMeta[flag.origin].label}
                </Badge>
                <Badge tone={flagSeverityMeta[flag.severity].tone}>
                  {flagSeverityMeta[flag.severity].label}
                </Badge>
                {flag.pageNumber !== null && (
                  <span className="text-xs text-text-muted">Page {flag.pageNumber}</span>
                )}
                {flag.pageNumber !== null && (
                  <button
                    type="button"
                    onClick={() => onFocusFlag(flag.id)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
                    title="Show on drawing"
                  >
                    <Crosshair className="h-3 w-3" />
                    Show
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-text-primary">{flag.message}</p>
              {resolvingId === flag.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    placeholder={
                      flag.origin === 'ai'
                        ? 'Correction (required if the AI was wrong)…'
                        : 'Resolution note (optional)…'
                    }
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setResolvingId(null)}>
                      Cancel
                    </Button>
                    {flag.origin === 'ai' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleResolve(flag, { action: 'accepted', value: flag.message })
                          }
                        >
                          Confirm as-is
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={resolutionNote.trim().length === 0}
                          onClick={() =>
                            handleResolve(flag, {
                              action: 'corrected',
                              value: resolutionNote.trim()
                            })
                          }
                        >
                          Add correction
                        </Button>
                      </>
                    ) : (
                      <Button variant="success" size="sm" onClick={() => handleResolve(flag)}>
                        Confirm resolve
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      isUnmatchedLineFlag
                        ? handleResolveUnmatchedLine(flag, line)
                        : setResolvingId(flag.id)
                    }
                    disabled={isChecking}
                  >
                    {isChecking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Resolve
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        {resolvedFlags.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-text-muted">Resolved</p>
            {resolvedFlags.map((flag) => (
              <div
                key={flag.id}
                className="mt-1 rounded-md bg-surface-raised p-2 text-xs text-text-muted"
              >
                <Badge tone={flagOriginMeta[flag.origin].tone}>
                  {flagOriginMeta[flag.origin].label}
                </Badge>{' '}
                {flag.message}
                {flag.resolutionNote && <span>, {flag.resolutionNote}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 border-t border-border-strong pt-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">Raise a flag</p>
        <Textarea
          rows={2}
          placeholder="Describe the issue…"
          value={newFlagMessage}
          onChange={(e) => setNewFlagMessage(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between">
          <select
            className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs text-text-primary"
            value={newFlagSeverity}
            onChange={(e) => setNewFlagSeverity(e.target.value as FlagSeverity)}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
          </select>
          <Button
            variant="accent"
            size="sm"
            onClick={handleRaise}
            disabled={newFlagMessage.trim().length === 0}
          >
            Raise flag
          </Button>
        </div>
      </div>

      {catalogResolveFlag && (
        <CatalogResolveModal
          key={catalogResolveFlag.flag.id}
          open
          onClose={() => setCatalogResolveFlag(null)}
          flagId={catalogResolveFlag.flag.id}
          quotationId={quotationId}
          sldId={sldId}
          projectId={projectId}
          line={catalogResolveFlag.line}
        />
      )}
    </Modal>
  )
}
