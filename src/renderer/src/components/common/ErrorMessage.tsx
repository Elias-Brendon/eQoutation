import { parseErrorMessage } from '@shared/errors/parseErrorMessage'
import { cn } from '@renderer/lib/cn'

interface ErrorMessageProps {
  message: string
  className?: string
}

// Renders an error the same clear way the User Manual's error-code table
// does — code and explanation both visible, so the user never has to go
// look the code up to understand what happened.
export function ErrorMessage({ message, className }: ErrorMessageProps): React.JSX.Element {
  const { code, explanation } = parseErrorMessage(message)
  return (
    <span className={cn(className)}>
      {code && <strong className="font-mono font-semibold">{code}</strong>}
      {code && ' — '}
      {explanation}
    </span>
  )
}
