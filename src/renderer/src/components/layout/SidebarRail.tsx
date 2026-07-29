import { type ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface SidebarRailProps {
  side: 'left' | 'right'
  label: string
  icon: LucideIcon
  count?: number
  collapsed: boolean
  pinned: boolean
  onTogglePinned: () => void
  children: ReactNode
}

// Wraps SldListColumn/QuotationListColumn without changing them: above the
// 1280px breakpoint, renders children in normal flow (today's behavior,
// unchanged). Below it, collapses to a slim icon rail — clicking pins the
// full column open as an overlay above the center panel, same slide-in/
// backdrop language as the existing Drawer component.
export function SidebarRail({
  side,
  label,
  icon: Icon,
  count,
  collapsed,
  pinned,
  onTogglePinned,
  children
}: SidebarRailProps): React.JSX.Element {
  useEffect(() => {
    if (!pinned) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onTogglePinned()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pinned, onTogglePinned])

  if (!collapsed) return <>{children}</>

  return (
    <>
      <button
        onClick={onTogglePinned}
        aria-label={pinned ? `Collapse ${label}` : `Expand ${label}`}
        title={label}
        className={cn(
          // z-40: stays above the pinned overlay's z-30 backdrop so it's
          // still visible and clickable (to re-collapse) while pinned open,
          // instead of being dimmed/occluded underneath it.
          'relative z-40 flex w-14 shrink-0 flex-col items-center gap-2 bg-surface py-4 transition-colors hover:bg-surface-hover',
          side === 'left' ? 'border-r border-border' : 'border-l border-border'
        )}
      >
        <Icon className="h-4 w-4 text-text-secondary" />
        <span className="whitespace-nowrap text-[11px] text-text-muted [writing-mode:vertical-rl]">
          {label}
        </span>
        {!!count && (
          <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
            {count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {pinned && (
          <motion.div
            className="fixed inset-0 z-30 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onTogglePinned}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className={cn(
                // Offset by the rail's own width (w-14) so the open drawer
                // sits beside the rail button, not on top of it — otherwise
                // the rail (and its re-collapse click target) is hidden
                // underneath the drawer.
                'absolute inset-y-0 z-40 flex shadow-2xl',
                side === 'left' ? 'left-14' : 'right-14'
              )}
              initial={{ x: side === 'left' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: side === 'left' ? '-100%' : '100%' }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
