import { useState, type FormEvent } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { Input } from '@renderer/components/common/Input'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useChangePassword, useSetSecurityQuestion } from '@renderer/state/queries/useAuth'
import { SECURITY_QUESTIONS, type AuthUser } from '@shared/types/entities'

interface AccountSectionProps {
  user: AuthUser | null
  onLogout: () => void
}

export function AccountSection({ user, onLogout }: AccountSectionProps): React.JSX.Element {
  const [securityQuestion, setSecurityQuestion] = useState<string>(SECURITY_QUESTIONS[0])
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedJustNow, setSavedJustNow] = useState(false)
  const setSecurityQuestionMutation = useSetSecurityQuestion()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordChangedJustNow, setPasswordChangedJustNow] = useState(false)
  const changePassword = useChangePassword()

  const handleSetRecovery = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    setSecurityQuestionMutation.mutate(
      { securityQuestion, securityAnswer },
      {
        onSuccess: () => {
          setSecurityAnswer('')
          setSavedJustNow(true)
        },
        onError: (err) => setError(err.message)
      }
    )
  }

  const handleChangePassword = (e: FormEvent): void => {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    changePassword.mutate(
      { oldPassword, newPassword },
      {
        onSuccess: () => {
          setOldPassword('')
          setNewPassword('')
          setConfirmPassword('')
          setPasswordChangedJustNow(true)
        },
        onError: (err) => setPasswordError(err.message)
      }
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Account</h3>
      <p className="text-xs text-text-secondary">
        Logged in as <span className="font-medium text-text-primary">{user?.username ?? '—'}</span>.
      </p>
      <Button variant="outline" size="sm" className="w-fit" onClick={onLogout}>
        <LogOut className="h-3.5 w-3.5" />
        Log out
      </Button>

      <div className="mt-2 border-t border-border pt-3">
        <h4 className="mb-1 text-xs font-semibold text-text-primary">Password recovery</h4>
        {user?.hasRecoveryQuestion && !setSecurityQuestionMutation.isSuccess ? (
          <p className="text-xs text-text-secondary">
            A recovery question is set up for this account. Setting a new one below replaces it.
          </p>
        ) : (
          <p className="text-xs text-warning">
            No recovery question set, if you forget your password, you won&apos;t be able to reset
            it. Set one up now.
          </p>
        )}
        {savedJustNow && <p className="mt-1 text-xs text-success">Recovery question saved.</p>}
        <form onSubmit={handleSetRecovery} className="mt-2 flex flex-col gap-2">
          <select
            value={securityQuestion}
            onChange={(e) => setSecurityQuestion(e.target.value)}
            className="h-9 w-full max-w-80 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
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
            className="max-w-80"
            required
          />
          {error && (
            <p className="text-xs text-danger">
              <ErrorMessage message={error} />
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={setSecurityQuestionMutation.isPending}
          >
            {setSecurityQuestionMutation.isPending ? 'Saving…' : 'Save recovery question'}
          </Button>
        </form>
      </div>

      <div className="mt-2 border-t border-border pt-3">
        <h4 className="mb-2 text-xs font-semibold text-text-primary">Change password</h4>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-2">
          <Input
            type="password"
            placeholder="Current password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="max-w-80"
            required
          />
          <Input
            type="password"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            className="max-w-80"
            required
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="max-w-80"
            required
          />
          {passwordError && (
            <p className="text-xs text-danger">
              <ErrorMessage message={passwordError} />
            </p>
          )}
          {passwordChangedJustNow && <p className="text-xs text-success">Password changed.</p>}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={changePassword.isPending}
          >
            {changePassword.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
