import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { AuthUser, UserRole } from '@shared/types/entities'

interface UserRow {
  id: string
  username: string
  password_hash: string
  role: UserRole
  security_question: string | null
  security_answer_hash: string | null
  created_at: string
  updated_at: string
}

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    hasRecoveryQuestion: row.security_question !== null && row.security_answer_hash !== null
  }
}

export function countUsers(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }
  return row.cnt
}

export function createUser(
  username: string,
  passwordHash: string,
  securityQuestion: string,
  securityAnswerHash: string
): AuthUser {
  const db = getDb()
  const now = new Date().toISOString()
  const row: UserRow = {
    id: randomUUID(),
    username,
    password_hash: passwordHash,
    role: 'admin',
    security_question: securityQuestion,
    security_answer_hash: securityAnswerHash,
    created_at: now,
    updated_at: now
  }
  db.prepare(
    `INSERT INTO users
       (id, username, password_hash, role, security_question, security_answer_hash, created_at, updated_at)
     VALUES
       (@id, @username, @password_hash, @role, @security_question, @security_answer_hash, @created_at, @updated_at)`
  ).run(row)
  return toUser(row)
}

export function getUserByUsername(username: string): (AuthUser & { passwordHash: string }) | null {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null
}

export function getUserById(id: string): AuthUser | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? toUser(row) : null
}

export function getPasswordHash(id: string): string | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? row.password_hash : null
}

export function updatePasswordHash(id: string, passwordHash: string): void {
  getDb()
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(passwordHash, new Date().toISOString(), id)
}

export interface RecoveryInfo {
  userId: string
  question: string
  answerHash: string
}

export function getRecoveryInfoByUsername(username: string): RecoveryInfo | null {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined
  if (!row || !row.security_question || !row.security_answer_hash) return null
  return { userId: row.id, question: row.security_question, answerHash: row.security_answer_hash }
}

export function setSecurityQuestion(id: string, question: string, answerHash: string): void {
  getDb()
    .prepare(
      'UPDATE users SET security_question = ?, security_answer_hash = ?, updated_at = ? WHERE id = ?'
    )
    .run(question, answerHash, new Date().toISOString(), id)
}
