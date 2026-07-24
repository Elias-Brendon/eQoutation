import { useState } from 'react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useApiKeyMasked, useSetApiKey, useTestApiKey } from '@renderer/state/queries/useSecrets'

export function ApiKeysSection(): React.JSX.Element {
  const { data: maskedKey } = useApiKeyMasked()
  const setApiKey = useSetApiKey()
  const testApiKey = useTestApiKey()
  const [candidateKey, setCandidateKey] = useState('')
  const [savedJustNow, setSavedJustNow] = useState(false)

  const handleSave = (): void => {
    setSavedJustNow(false)
    setApiKey.mutate(candidateKey, {
      onSuccess: () => {
        setCandidateKey('')
        setSavedJustNow(true)
      }
    })
  }

  const handleTest = (): void => {
    testApiKey.mutate(candidateKey)
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">API Keys</h3>
      <p className="text-xs text-text-secondary">
        Your Anthropic API key, used for AI extraction. Stored encrypted at rest via your OS's
        secure storage — never logged or sent anywhere except Anthropic's API.
      </p>
      <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
        Current key: <span className="font-mono text-text-primary">{maskedKey ?? 'none set'}</span>
      </div>
      <Input
        type="password"
        placeholder="sk-ant-…"
        value={candidateKey}
        onChange={(e) => setCandidateKey(e.target.value)}
        className="max-w-80"
      />
      {testApiKey.data && (
        <p className={`text-xs ${testApiKey.data.ok ? 'text-success' : 'text-danger'}`}>
          {testApiKey.data.ok ? 'Connection succeeded.' : testApiKey.data.error}
        </p>
      )}
      {savedJustNow && setApiKey.isSuccess && <p className="text-xs text-success">Key saved.</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={!candidateKey.trim() || testApiKey.isPending}
        >
          {testApiKey.isPending ? 'Testing…' : 'Test connection'}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={handleSave}
          disabled={!candidateKey.trim() || setApiKey.isPending}
        >
          {setApiKey.isPending ? 'Saving…' : 'Save key'}
        </Button>
      </div>
    </div>
  )
}
