// In-memory only, for the lifetime of the main process. A user who logs in
// without "remember me" is authenticated only until the app quits — no
// session token is ever written to disk for that case.
let currentUserId: string | null = null

export function getCurrentUserId(): string | null {
  return currentUserId
}

export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId
}
