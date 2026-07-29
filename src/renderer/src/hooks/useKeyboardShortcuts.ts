import { useEffect } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  handler: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null
}

// App-wide shortcuts, ignored while typing in a field or while any
// Modal/Drawer (role="dialog") is open — so they never hijack normal input
// or fire underneath a dialog the user is focused on.
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || isDialogOpen()) return
      for (const shortcut of shortcuts) {
        const ctrlMatches = (shortcut.ctrl ?? false) === (e.ctrlKey || e.metaKey)
        const shiftMatches = (shortcut.shift ?? false) === e.shiftKey
        if (ctrlMatches && shiftMatches && e.key.toLowerCase() === shortcut.key.toLowerCase()) {
          e.preventDefault()
          shortcut.handler()
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
