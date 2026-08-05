import { formatErrorCode, ERROR_CODES, type ErrorKey } from '@shared/errors/errorCodes'

// Every intentional user-facing error thrown from the main process should be
// an AppError, not a raw `new Error(...)` — its message is always
// "Error <CODE>: <plain-language text>", which is what safely crosses the
// Electron IPC boundary (only `.message` survives), so the renderer needs no
// special handling to show it. See src/main/ipc/safeHandle.ts for how
// anything that *isn't* an AppError gets sanitized before reaching the UI.
export class AppError extends Error {
  readonly errorCode: string
  readonly usage?: { inputTokens: number; outputTokens: number }

  // `detail` appends the provider's own error text (e.g. "You have reached
  // your specified API usage limits...") to the fixed error-code message —
  // for errors like a 400 from the AI provider that aren't one of the
  // specifically-classified cases (rate limit/auth/connection), the fixed
  // generic message alone hides genuinely useful, specific information.
  constructor(
    key: ErrorKey,
    usage?: { inputTokens: number; outputTokens: number },
    detail?: string
  ) {
    super(detail ? `${formatErrorCode(key)} — ${detail}` : formatErrorCode(key))
    this.name = 'AppError'
    this.errorCode = ERROR_CODES[key].code
    this.usage = usage
  }
}
