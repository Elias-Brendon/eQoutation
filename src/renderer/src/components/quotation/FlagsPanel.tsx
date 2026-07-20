import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Badge } from '@renderer/components/common/Badge'
import { Button } from '@renderer/components/common/Button'
import { Textarea } from '@renderer/components/common/Textarea'
import { useFlagsByQuotation, useRaiseFlag, useResolveFlag } from '@renderer/state/queries/useFlags'
import { flagOriginMeta, flagSeverityMeta } from '@renderer/lib/statusMeta'
import type { Flag, FlagSeverity } from '@shared/types/entities'

interface FlagsPanelProps {
  open: boolean
  onClose: () => void
  quotationId: string
  projectId: string
}

export function FlagsPanel({
  open,
  onClose,
  quotationId,
  projectId
}: FlagsPanelProps): React.JSX.Element {
  const { data: flags = [] } = useFlagsByQuotation(quotationId)
  const raiseFlag = useRaiseFlag()
  const resolveFlag = useResolveFlag()

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [newFlagMessage, setNewFlagMessage] = useState('')
  const [newFlagSeverity, setNewFlagSeverity] = useState<FlagSeverity>('warning')

  const openFlags = flags.filter((f) => f.status === 'open')
  const resolvedFlags = flags.filter((f) => f.status === 'resolved')

  const handleResolve = (flag: Flag): void => {
    resolveFlag.mutate(
      { id: flag.id, resolutionNote: resolutionNote.trim() || undefined, quotationId, projectId },
      {
        onSuccess: () => {
          setResolvingId(null)
          setResolutionNote('')
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
        {openFlags.map((flag) => (
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
            </div>
            <p className="mt-1 text-sm text-text-primary">{flag.message}</p>
            {resolvingId === flag.id ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Resolution note (optional)…"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setResolvingId(null)}>
                    Cancel
                  </Button>
                  <Button variant="success" size="sm" onClick={() => handleResolve(flag)}>
                    Confirm resolve
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setResolvingId(flag.id)}>
                  Resolve
                </Button>
              </div>
            )}
          </div>
        ))}
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
                {flag.resolutionNote && <span> — {flag.resolutionNote}</span>}
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
    </Modal>
  )
}
