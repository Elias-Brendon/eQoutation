import { motion } from 'framer-motion'
import { Logo } from '@renderer/components/animation/Logo'

export function SplashScreen(): React.JSX.Element {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center gap-5"
      >
        <Logo className="scale-150" />
        <div className="h-1 w-32 overflow-hidden rounded-full bg-surface-raised">
          <motion.div
            className="h-full w-1/3 rounded-full bg-accent"
            animate={{ x: ['-100%', '250%'] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
