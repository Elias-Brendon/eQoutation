import { randomUUID } from 'crypto'
import { getDb } from '../index'

interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

const SESSION_TTL_DAYS = 30

export function createSession(userId: string, tokenHash: string): { expiresAt: string } {
  const db = getDb()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(randomUUID(), userId, tokenHash, now.toISOString(), expiresAt)

  return { expiresAt }
}

export function getValidSessionByTokenHash(tokenHash: string): SessionRow | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM sessions
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(tokenHash, new Date().toISOString()) as SessionRow | undefined
  return row ?? null
}

export function revokeSessionByTokenHash(tokenHash: string): void {
  getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), tokenHash)
}
