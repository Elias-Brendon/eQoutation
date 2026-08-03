import { deleteSecret, getMaskedSecret, setSecret } from '../settings/secretsStore'
import { testAnthropicApiKey } from '../ai/ClaudeProvider'
import { getSettings, updateSettings } from '../settings/settingsStore'
import { resolveAiModelForModelList } from '../settings/aiModelResolver'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { SecretKeyName, TestApiKeyResult } from '@shared/types/entities'

export function registerSecretsIpc(): void {
  safeHandle(
    IPC.secretsSetApiKey,
    (_event, keyName: SecretKeyName, key: string): void => {
      if (!key.trim()) throw new AppError('SEC_KEY_EMPTY')
      setSecret(keyName, key.trim())
    }
  )

  safeHandle(IPC.secretsGetApiKeyMasked, (_event, keyName: SecretKeyName): string | null =>
    getMaskedSecret(keyName)
  )

  safeHandle(
    IPC.secretsTestApiKey,
    async (_event, _keyName: SecretKeyName, key: string): Promise<TestApiKeyResult> => {
      const result = await testAnthropicApiKey(key)
      if (result.ok && result.models) {
        const currentAiModel = getSettings().aiModel
        updateSettings({
          cachedAiModels: result.models,
          aiModel: resolveAiModelForModelList(currentAiModel, result.models)
        })
      }
      return result
    }
  )

  safeHandle(IPC.secretsDeleteApiKey, (_event, keyName: SecretKeyName): void =>
    deleteSecret(keyName)
  )
}
