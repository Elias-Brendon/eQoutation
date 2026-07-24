import { ipcMain } from 'electron'
import { getMaskedAnthropicApiKey, setAnthropicApiKey } from '../settings/secretsStore'
import { testAnthropicApiKey } from '../ai/ClaudeProvider'
import { IPC } from '@shared/types/ipc-contract'
import type { TestApiKeyResult } from '@shared/types/entities'

export function registerSecretsIpc(): void {
  ipcMain.handle(IPC.secretsSetApiKey, (_event, key: string): void => {
    if (!key.trim()) throw new Error('API key cannot be empty')
    setAnthropicApiKey(key.trim())
  })

  ipcMain.handle(IPC.secretsGetApiKeyMasked, (): string | null => getMaskedAnthropicApiKey())

  ipcMain.handle(IPC.secretsTestApiKey, (_event, key: string): Promise<TestApiKeyResult> =>
    testAnthropicApiKey(key)
  )
}
