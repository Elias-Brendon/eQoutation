import { useState, type FormEvent } from 'react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useRecoveryQuestion, useResetPassword } from '@renderer/state/queries/useAuth'

interface ForgotPasswordFlowProps {
  onDone: () => void
}

export function ForgotPasswordFlow({ onDone }: ForgotPasswordFlowProps): React.JSX.Element {
  const [step, setStep] = useState<'username' | 'answer'>('username')
  const [username, setUsername] = useState('')
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recoveryQuestion = useRecoveryQuestion()
  const resetPassword = useResetPassword()

  const handleFindAccount = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    recoveryQuestion.mutate(username, {
      onSuccess: (result) => {
        if (!result.question) {
          setError('No recovery question is set up for that account.')
          return
        }
        setQuestion(result.question)
        setStep('answer')
      },
      onError: (err) => setError(err.message)
    })
  }

  const handleReset = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    resetPassword.mutate(
      { username, answer, newPassword },
      { onSuccess: () => onDone(), onError: (err) => setError(err.message) }
    )
  }

  if (step === 'username') {
    return (
      <form onSubmit={handleFindAccount} className="flex flex-col gap-3">
        <p className="text-xs text-text-secondary">
          Enter your username to find your recovery question.
        </p>
        <Input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />
        {error && (
          <p className="text-xs text-danger">
            <ErrorMessage message={error} />
          </p>
        )}
        <Button
          type="submit"
          variant="accent"
          disabled={recoveryQuestion.isPending}
          className="w-full"
        >
          {recoveryQuestion.isPending ? 'Looking up…' : 'Continue'}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-center text-xs text-text-secondary hover:text-text-primary"
        >
          Back to log in
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleReset} className="flex flex-col gap-3">
      <p className="text-xs font-medium text-text-primary">{question}</p>
      <Input
        placeholder="Your answer"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        autoFocus
        required
      />
      <Input
        type="password"
        placeholder="New password (min 8 characters)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        minLength={8}
        required
      />
      <Input
        type="password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" variant="accent" disabled={resetPassword.isPending} className="w-full">
        {resetPassword.isPending ? 'Resetting…' : 'Reset password'}
      </Button>
      <button
        type="button"
        onClick={onDone}
        className="text-center text-xs text-text-secondary hover:text-text-primary"
      >
        Back to log in
      </button>
    </form>
  )
}
