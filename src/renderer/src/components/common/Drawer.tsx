import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@renderer/lib/cn'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  className
}: DrawerProps): React.JSX.Element | null {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={cn(
              'absolute right-0 top-0 flex h-full w-[420px] max-w-[90vw] flex-col gap-4 overflow-y-auto border-l border-border bg-surface-raised p-5 shadow-2xl',
              className
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
