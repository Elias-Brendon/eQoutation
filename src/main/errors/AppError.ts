import { formatErrorCode, ERROR_CODES, type ErrorKey } from '@shared/errors/errorCodes'

// Every intentional user-facing error thrown from the main process should be
// an AppError, not a raw `new Error(...)` — its message is always
// "Error <CODE>: <plain-language text>", which is what safely crosses the
// Electron IPC boundary (only `.message` survives), so the renderer needs no
// special handling to show it. See src/main/ipc/safeHandle.ts for how
// anything that *isn't* an AppError gets sanitized before reaching the UI.
export class AppError extends Error {
  readonly errorCode: string

  constructor(key: ErrorKey) {
    super(formatErrorCode(key))
    this.name = 'AppError'
    this.errorCode = ERROR_CODES[key].code
  }
}
