import { useEffect, useRef, useState } from 'react'

interface TextEntryOverlayProps {
  leftPct: number
  topPct: number
  color: string
  onConfirm: (text: string) => void
  onCancel: () => void
}

// Replaces the blocking window.prompt() previously used for pin comments —
// a real inline text box, used by both the pin and text tools.
export function TextEntryOverlay({
  leftPct,
  topPct,
  color,
  onConfirm,
  onCancel
}: TextEntryOverlayProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const commitOrCancel = (): void => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
    else onCancel()
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commitOrCancel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commitOrCancel()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      placeholder="Type a comment…"
      rows={2}
      className="pointer-events-auto absolute z-10 min-w-[140px] -translate-y-1/2 resize-none rounded-md border bg-surface px-2 py-1 text-xs text-text-primary shadow-lg focus:outline-none"
      style={{ left: `${leftPct * 100}%`, top: `${topPct * 100}%`, borderColor: color }}
    />
  )
}
