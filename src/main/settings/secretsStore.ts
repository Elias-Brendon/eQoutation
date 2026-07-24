import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface SecretsFile {
  anthropicApiKey?: string
}

function secretsFilePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function readSecretsFile(): SecretsFile {
  const filePath = secretsFilePath()
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SecretsFile
  } catch {
    return {}
  }
}

function writeSecretsFile(data: SecretsFile): void {
  const filePath = secretsFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export function setAnthropicApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level secret encryption is not available on this machine')
  }
  const encrypted = safeStorage.encryptString(key)
  writeSecretsFile({ ...readSecretsFile(), anthropicApiKey: encrypted.toString('base64') })
}

function getStoredAnthropicApiKey(): string | null {
  const stored = readSecretsFile().anthropicApiKey
  if (!stored || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

// Dev-only fallback: .env is fine locally, but a packaged build should never
// silently read a plaintext env var for a secret once the in-app key store
// is available (see original build plan Risk #5).
export function getAnthropicApiKey(): string | null {
  const stored = getStoredAnthropicApiKey()
  if (stored) return stored
  if (!app.isPackaged && process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY
  }
  return null
}

export function getMaskedAnthropicApiKey(): string | null {
  const key = getAnthropicApiKey()
  if (!key) return null
  return `••••••••${key.slice(-4)}`
}
