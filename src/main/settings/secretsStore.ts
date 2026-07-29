import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppError } from '../errors/AppError'
import type { SecretKeyName } from '@shared/types/entities'

type SecretsFile = Partial<Record<SecretKeyName, string>>

// Dev-only fallback: .env is fine locally, but a packaged build should never
// silently read a plaintext env var for a secret once the in-app key store
// is available (see original build plan Risk #5).
const DEV_ENV_FALLBACK: Record<SecretKeyName, string> = {
  anthropicApiKey: 'ANTHROPIC_API_KEY'
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

export function setSecret(name: SecretKeyName, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError('SEC_ENCRYPTION_UNAVAILABLE')
  }
  const encrypted = safeStorage.encryptString(value)
  writeSecretsFile({ ...readSecretsFile(), [name]: encrypted.toString('base64') })
}

export function deleteSecret(name: SecretKeyName): void {
  const data = readSecretsFile()
  delete data[name]
  writeSecretsFile(data)
}

function getStoredSecret(name: SecretKeyName): string | null {
  const stored = readSecretsFile()[name]
  if (!stored || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

export function getSecret(name: SecretKeyName): string | null {
  const stored = getStoredSecret(name)
  if (stored) return stored
  const envVar = DEV_ENV_FALLBACK[name]
  if (!app.isPackaged && process.env[envVar]) return process.env[envVar] as string
  return null
}

export function getMaskedSecret(name: SecretKeyName): string | null {
  const key = getSecret(name)
  if (!key) return null
  return `••••••••${key.slice(-4)}`
}

export const getAnthropicApiKey = (): string | null => getSecret('anthropicApiKey')
export const setAnthropicApiKey = (key: string): void => setSecret('anthropicApiKey', key)
export const getMaskedAnthropicApiKey = (): string | null => getMaskedSecret('anthropicApiKey')
