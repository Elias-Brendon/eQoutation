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
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
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
  safeHandle(IPC.authGetStatus, (): AuthStatus => {
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

  safeHandle(IPC.authSetup, (_event, input: SetupInput): AuthUser => {
    if (countUsers() > 0) throw new AppError('AUTH_SETUP_ALREADY_DONE')
    const username = input.username.trim()
    if (!username) throw new AppError('AUTH_USERNAME_REQUIRED')
    if (input.password.length < 8) throw new AppError('AUTH_PASSWORD_TOO_SHORT')
    if (!input.securityQuestion) throw new AppError('AUTH_SECURITY_QUESTION_REQUIRED')
    if (!normalizeAnswer(input.securityAnswer)) throw new AppError('AUTH_SECURITY_ANSWER_REQUIRED')

    const user = createUser(
      username,
      hashPassword(input.password),
      input.securityQuestion,
      hashPassword(normalizeAnswer(input.securityAnswer))
    )
    setCurrentUserId(user.id)
    return user
  })

  safeHandle(IPC.authLogin, (_event, input: LoginInput): AuthUser => {
    const record = getUserByUsername(input.username.trim())
    if (!record || !verifyPassword(input.password, record.passwordHash)) {
      throw new AppError('AUTH_INVALID_CREDENTIALS')
    }
    setCurrentUserId(record.id)

    if (input.rememberMe) {
      const token = randomBytes(32).toString('hex')
      const { expiresAt } = createSession(record.id, hashToken(token))
      writeSessionToken({ token, userId: record.id, expiresAt })
    }

    const user = getUserById(record.id)
    if (!user) throw new AppError('AUTH_USER_NOT_FOUND')
    return user
  })

  safeHandle(IPC.authLogout, (): void => {
    const stored = readSessionToken()
    if (stored) revokeSessionByTokenHash(hashToken(stored.token))
    clearSessionToken()
    setCurrentUserId(null)
  })

  safeHandle(
    IPC.authGetRecoveryQuestion,
    (_event, username: string): RecoveryQuestionResult => {
      const info = getRecoveryInfoByUsername(username.trim())
      return { question: info?.question ?? null }
    }
  )

  safeHandle(IPC.authResetPassword, (_event, input: ResetPasswordInput): AuthUser => {
    const info = getRecoveryInfoByUsername(input.username.trim())
    if (!info || !verifyPassword(normalizeAnswer(input.answer), info.answerHash)) {
      throw new AppError('AUTH_RECOVERY_ANSWER_MISMATCH')
    }
    if (input.newPassword.length < 8) throw new AppError('AUTH_PASSWORD_TOO_SHORT')

    updatePasswordHash(info.userId, hashPassword(input.newPassword))
    setCurrentUserId(info.userId)

    const user = getUserById(info.userId)
    if (!user) throw new AppError('AUTH_USER_NOT_FOUND')
    return user
  })

  safeHandle(
    IPC.authSetSecurityQuestion,
    (_event, input: SetSecurityQuestionInput): void => {
      const userId = getCurrentUserId()
      if (!userId) throw new AppError('AUTH_NOT_LOGGED_IN')
      if (!input.securityQuestion) throw new AppError('AUTH_SECURITY_QUESTION_REQUIRED')
      if (!normalizeAnswer(input.securityAnswer)) throw new AppError('AUTH_SECURITY_ANSWER_REQUIRED')

      setSecurityQuestion(
        userId,
        input.securityQuestion,
        hashPassword(normalizeAnswer(input.securityAnswer))
      )
    }
  )

  safeHandle(IPC.authChangePassword, (_event, input: ChangePasswordInput): void => {
    const userId = getCurrentUserId()
    if (!userId) throw new AppError('AUTH_NOT_LOGGED_IN')

    const storedHash = getPasswordHash(userId)
    if (!storedHash || !verifyPassword(input.oldPassword, storedHash)) {
      throw new AppError('AUTH_CURRENT_PASSWORD_INCORRECT')
    }
    if (input.newPassword.length < 8) throw new AppError('AUTH_PASSWORD_TOO_SHORT')

    updatePasswordHash(userId, hashPassword(input.newPassword))
  })
}
