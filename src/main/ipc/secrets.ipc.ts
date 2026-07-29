import { deleteSecret, getMaskedSecret, setSecret } from '../settings/secretsStore'
import { testAnthropicApiKey } from '../ai/ClaudeProvider'
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
    (_event, _keyName: SecretKeyName, key: string): Promise<TestApiKeyResult> =>
      testAnthropicApiKey(key)
  )

  safeHandle(IPC.secretsDeleteApiKey, (_event, keyName: SecretKeyName): void =>
    deleteSecret(keyName)
  )
}
