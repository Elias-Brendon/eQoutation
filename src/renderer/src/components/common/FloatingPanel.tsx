import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { cn } from '@renderer/lib/cn'

interface FloatingPanelProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

// Non-modal alternative to Modal/Drawer: no backdrop, so the rest of the app
// stays fully interactive and visible while it's open, and there's no
// click-outside-to-close — only the explicit X button closes it. Meant for
// panels a user wants to keep open alongside other work (e.g. searching the
// catalog while still looking at the quotation table underneath).
export function FloatingPanel({
  open,
  onClose,
  title,
  children,
  className
}: FloatingPanelProps): React.JSX.Element | null {
  const dragControls = useDragControls()

  // Portaled to <body> — this can be nested inside another Modal/Drawer
  // (e.g. FlagsPanel opening this to resolve a flag), whose animated card
  // sits under a CSS transform. A transformed ancestor becomes the
  // containing block for `position: fixed` descendants, which would make
  // this panel position itself relative to that small card instead of the
  // viewport. Portaling escapes that entirely.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label={title}
          className={cn(
            'fixed right-4 top-16 z-50 flex max-h-[calc(100vh-5rem)] w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-2xl',
            className
          )}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          drag
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
        >
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="flex shrink-0 cursor-move items-center justify-between border-b border-border px-4 py-3"
          >
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              title="Close"
              className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
