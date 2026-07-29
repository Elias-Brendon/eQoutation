import { useState, type FormEvent } from 'react'
import { Logo } from '@renderer/components/animation/Logo'
import { Card } from '@renderer/components/common/Card'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useLogin } from '@renderer/state/queries/useAuth'
import { ForgotPasswordFlow } from '@renderer/components/auth/ForgotPasswordFlow'

export function LoginScreen(): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const login = useLogin()

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    login.mutate({ username, password, rememberMe }, { onError: (err) => setError(err.message) })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg">
      <Card className="w-96 p-6">
        <div className="mb-6 flex justify-center">
          <Logo className="scale-125" />
        </div>
        <h1 className="mb-5 text-center text-sm font-semibold text-text-primary">
          {showForgotPassword ? 'Reset password' : 'Log in'}
        </h1>
        {showForgotPassword ? (
          <ForgotPasswordFlow onDone={() => setShowForgotPassword(false)} />
        ) : (
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
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs text-accent hover:underline"
              >
                Forgot password?
              </button>
            </div>
            {error && (
              <p className="text-xs text-danger">
                <ErrorMessage message={error} />
              </p>
            )}
            <Button
              type="submit"
              variant="accent"
              disabled={login.isPending}
              className="mt-1 w-full"
            >
              {login.isPending ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
