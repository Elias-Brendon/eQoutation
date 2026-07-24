import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

interface StoredSessionToken {
  token: string
  userId: string
  expiresAt: string
}

function tokenFilePath(): string {
  return join(app.getPath('userData'), 'session.token')
}

export function readSessionToken(): StoredSessionToken | null {
  const filePath = tokenFilePath()
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as StoredSessionToken
  } catch {
    return null
  }
}

export function writeSessionToken(data: StoredSessionToken): void {
  const filePath = tokenFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export function clearSessionToken(): void {
  const filePath = tokenFilePath()
  if (existsSync(filePath)) unlinkSync(filePath)
}
