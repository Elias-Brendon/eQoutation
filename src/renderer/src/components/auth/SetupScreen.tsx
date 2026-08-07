import { useState, type FormEvent } from 'react'
import { Logo } from '@renderer/components/animation/Logo'
import { Card } from '@renderer/components/common/Card'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useSetup } from '@renderer/state/queries/useAuth'
import { SECURITY_QUESTIONS } from '@shared/types/entities'

export function SetupScreen(): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [securityQuestion, setSecurityQuestion] = useState<string>(SECURITY_QUESTIONS[0])
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setup = useSetup()

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setup.mutate(
      { username, password, securityQuestion, securityAnswer },
      { onError: (err) => setError(err.message) }
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg">
      <Card className="w-[420px] p-6">
        <div className="mb-6 flex justify-center">
          <Logo className="scale-125" />
        </div>
        <h1 className="mb-1 text-center text-sm font-semibold text-text-primary">
          Create your account
        </h1>
        <p className="mb-5 text-center text-xs text-text-secondary">
          First run, set up the local account that guards this app.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
          <Input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <div className="mt-1 border-t border-border pt-3">
            <p className="mb-2 text-xs text-text-secondary">
              Choose a security question, this is how you&apos;ll recover your account if you forget
              your password.
            </p>
            <select
              value={securityQuestion}
              onChange={(e) => setSecurityQuestion(e.target.value)}
              className="mb-2 h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {SECURITY_QUESTIONS.map((question) => (
                <option key={question} value={question}>
                  {question}
                </option>
              ))}
            </select>
            <Input
              placeholder="Your answer"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-danger">
              <ErrorMessage message={error} />
            </p>
          )}
          <Button type="submit" variant="accent" disabled={setup.isPending} className="mt-1 w-full">
            {setup.isPending ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
