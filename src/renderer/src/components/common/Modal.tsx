import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@renderer/components/common/Card'
import { cn } from '@renderer/lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className
}: ModalProps): React.JSX.Element | null {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Card className={cn('w-96 p-5', className)}>
              <h2 className="mb-4 text-sm font-semibold text-text-primary">{title}</h2>
              {children}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
