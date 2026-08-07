import { useState } from 'react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useSettings } from '@renderer/state/queries/useSettings'
import {
  useApiKeyMasked,
  useDeleteApiKey,
  useSetApiKey,
  useTestApiKey
} from '@renderer/state/queries/useSecrets'
import type { SecretKeyName } from '@shared/types/entities'

export function ApiKeysSection(): React.JSX.Element {
  const { data: settings } = useSettings()

  return (
    <div className="flex flex-col gap-6">
      {settings?.aiProvider === 'openai-compatible' ? (
        <ApiKeyField
          keyName="openaiCompatibleApiKey"
          label="OpenAI-Compatible API Key"
          description="Your API key for the provider configured in Settings > AI Model (OpenAI, Qwen, Grok, or a local server). Stored encrypted at rest via your OS's secure storage, never logged or sent anywhere except that provider's endpoint."
          placeholder="sk-…"
        />
      ) : (
        <ApiKeyField
          keyName="anthropicApiKey"
          label="Anthropic API Key"
          description="Your Anthropic API key, used for AI extraction. Stored encrypted at rest via your OS's secure storage, never logged or sent anywhere except Anthropic's API. Testing the connection also refreshes the model list in Settings > AI Model."
          placeholder="sk-ant-…"
        />
      )}
    </div>
  )
}

interface ApiKeyFieldProps {
  keyName: SecretKeyName
  label: string
  description: string
  placeholder: string
}

function ApiKeyField({
  keyName,
  label,
  description,
  placeholder
}: ApiKeyFieldProps): React.JSX.Element {
  const { data: maskedKey } = useApiKeyMasked(keyName)
  const setApiKey = useSetApiKey(keyName)
  const testApiKey = useTestApiKey(keyName)
  const deleteApiKey = useDeleteApiKey(keyName)
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

  const handleDelete = (): void => {
    setSavedJustNow(false)
    deleteApiKey.mutate()
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
      <p className="text-xs text-text-secondary">{description}</p>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
        <span>
          Current key:{' '}
          <span className="font-mono text-text-primary">{maskedKey ?? 'none set'}</span>
        </span>
        {maskedKey && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteApiKey.isPending}
          >
            {deleteApiKey.isPending ? 'Deleting…' : 'Delete key'}
          </Button>
        )}
      </div>
      <Input
        type="password"
        placeholder={placeholder}
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
