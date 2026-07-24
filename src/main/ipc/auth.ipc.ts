import { ipcMain } from 'electron'
import { createHash, randomBytes } from 'crypto'
import {
  countUsers,
  createUser,
  getPasswordHash,
  getRecoveryInfoByUsername,
  getUserById,
  getUserByUsername,
  setSecurityQuestion,
  updatePasswordHash
} from '../db/repositories/usersRepo'
import {
  createSession,
  getValidSessionByTokenHash,
  revokeSessionByTokenHash
} from '../db/repositories/sessionsRepo'
import { hashPassword, verifyPassword } from '../auth/passwordHash'
import { getCurrentUserId, setCurrentUserId } from '../auth/authState'
import { clearSessionToken, readSessionToken, writeSessionToken } from '../auth/sessionTokenStore'
import { IPC } from '@shared/types/ipc-contract'
import type {
  AuthStatus,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  RecoveryQuestionResult,
  ResetPasswordInput,
  SetSecurityQuestionInput,
  SetupInput
} from '@shared/types/entities'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Answers are normalized before hashing so trivial recall differences
// (case, surrounding whitespace) don't lock the user out of their own
// recovery flow.
function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase()
}

// Resolves a persisted "remember me" token into a live user, or clears it
// if it's missing/expired/revoked. Only consulted when no in-memory session
// exists yet (e.g. right after a cold start).
function resolveSessionUser(): AuthUser | null {
  const stored = readSessionToken()
  if (!stored) return null

  if (new Date(stored.expiresAt).getTime() <= Date.now()) {
    clearSessionToken()
    return null
  }

  const session = getValidSessionByTokenHash(hashToken(stored.token))
  if (!session) {
    clearSessionToken()
    return null
  }

  return getUserById(stored.userId)
}

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.authGetStatus, (): AuthStatus => {
    if (countUsers() === 0) return { state: 'needsSetup', user: null }

    const activeUserId = getCurrentUserId()
    if (activeUserId) {
      const user = getUserById(activeUserId)
      if (user) return { state: 'authenticated', user }
    }

    const sessionUser = resolveSessionUser()
    if (sessionUser) {
      setCurrentUserId(sessionUser.id)
      return { state: 'authenticated', user: sessionUser }
    }

    return { state: 'unauthenticated', user: null }
  })

  ipcMain.handle(IPC.authSetup, (_event, input: SetupInput): AuthUser => {
    if (countUsers() > 0) throw new Error('Setup has already been completed')
    const username = input.username.trim()
    if (!username) throw new Error('Username is required')
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters')
    if (!input.securityQuestion) throw new Error('A security question is required')
    if (!normalizeAnswer(input.securityAnswer)) throw new Error('A security answer is required')

    const user = createUser(
      username,
      hashPassword(input.password),
      input.securityQuestion,
      hashPassword(normalizeAnswer(input.securityAnswer))
    )
    setCurrentUserId(user.id)
    return user
  })

  ipcMain.handle(IPC.authLogin, (_event, input: LoginInput): AuthUser => {
    const record = getUserByUsername(input.username.trim())
    if (!record || !verifyPassword(input.password, record.passwordHash)) {
      throw new Error('Invalid username or password')
    }
    setCurrentUserId(record.id)

    if (input.rememberMe) {
      const token = randomBytes(32).toString('hex')
      const { expiresAt } = createSession(record.id, hashToken(token))
      writeSessionToken({ token, userId: record.id, expiresAt })
    }

    const user = getUserById(record.id)
    if (!user) throw new Error('User not found')
    return user
  })

  ipcMain.handle(IPC.authLogout, (): void => {
    const stored = readSessionToken()
    if (stored) revokeSessionByTokenHash(hashToken(stored.token))
    clearSessionToken()
    setCurrentUserId(null)
  })

  ipcMain.handle(
    IPC.authGetRecoveryQuestion,
    (_event, username: string): RecoveryQuestionResult => {
      const info = getRecoveryInfoByUsername(username.trim())
      return { question: info?.question ?? null }
    }
  )

  ipcMain.handle(IPC.authResetPassword, (_event, input: ResetPasswordInput): AuthUser => {
    const info = getRecoveryInfoByUsername(input.username.trim())
    if (!info || !verifyPassword(normalizeAnswer(input.answer), info.answerHash)) {
      throw new Error('That answer does not match our records')
    }
    if (input.newPassword.length < 8) throw new Error('Password must be at least 8 characters')

    updatePasswordHash(info.userId, hashPassword(input.newPassword))
    setCurrentUserId(info.userId)

    const user = getUserById(info.userId)
    if (!user) throw new Error('User not found')
    return user
  })

  ipcMain.handle(
    IPC.authSetSecurityQuestion,
    (_event, input: SetSecurityQuestionInput): void => {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('Not logged in')
      if (!input.securityQuestion) throw new Error('A security question is required')
      if (!normalizeAnswer(input.securityAnswer)) throw new Error('A security answer is required')

      setSecurityQuestion(
        userId,
        input.securityQuestion,
        hashPassword(normalizeAnswer(input.securityAnswer))
      )
    }
  )

  ipcMain.handle(IPC.authChangePassword, (_event, input: ChangePasswordInput): void => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const storedHash = getPasswordHash(userId)
    if (!storedHash || !verifyPassword(input.oldPassword, storedHash)) {
      throw new Error('Current password is incorrect')
    }
    if (input.newPassword.length < 8) throw new Error('Password must be at least 8 characters')

    updatePasswordHash(userId, hashPassword(input.newPassword))
  })
}
