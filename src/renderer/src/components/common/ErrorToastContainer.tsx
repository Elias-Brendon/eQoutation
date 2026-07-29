import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { useErrorToastStore } from '@renderer/state/useErrorToastStore'
import { ErrorMessage } from './ErrorMessage'

const AUTO_DISMISS_MS = 8000

export function ErrorToastContainer(): React.JSX.Element {
  const toasts = useErrorToastStore((s) => s.toasts)
  const dismiss = useErrorToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ErrorToast key={toast.id} id={toast.id} message={toast.message} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

interface ErrorToastProps {
  id: string
  message: string
  onDismiss: (id: string) => void
}

function ErrorToast({ id, message, onDismiss }: ErrorToastProps): React.JSX.Element {
  useEffect(() => {
    const timeout = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS)
    return () => clearTimeout(timeout)
  }, [id, onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2.5 text-xs text-danger shadow-lg"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <ErrorMessage message={message} className="flex-1" />
      <button
        onClick={() => onDismiss(id)}
        className="shrink-0 text-danger/70 hover:text-danger"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
