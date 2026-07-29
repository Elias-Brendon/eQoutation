import { ERROR_CODES } from './errorCodes'

export interface ParsedError {
  code: string | null
  explanation: string
}

// AppError messages are always "Error <CODE>: <explanation>" (see
// src/main/errors/AppError.ts), but Electron's ipcMain.handle wraps any
// thrown error before it reaches the renderer — e.g. `error.message` here is
// actually "Error invoking remote method 'ai:extractSld': AppError: Error
// AI-001: Anthropic API key not set", not the clean string AppError built.
// Deliberately NOT anchored to the start of the string: this searches for
// our own "Error <CODE>: " marker wherever it lands and discards everything
// before it (the IPC channel name, the class name) — both irrelevant to the
// user and exactly the kind of internal detail this system exists to hide.
// Falls back to treating the whole string as the explanation for anything
// that doesn't match — e.g. a plain client-side validation message that
// never went through AppError/IPC at all.
const ERROR_MESSAGE_PATTERN = /Error\s+([A-Z]+-\d+):\s*([\s\S]+)$/

// Guards against misparsing a foreign error that happens to contain an
// "Error XX-###:" looking substring (e.g. a vendor/network library's own
// error text) — only codes this app actually defines are treated as ours.
const KNOWN_CODES = new Set<string>(Object.values(ERROR_CODES).map((entry) => entry.code))

export function parseErrorMessage(message: string): ParsedError {
  const match = message.match(ERROR_MESSAGE_PATTERN)
  if (!match || !KNOWN_CODES.has(match[1])) return { code: null, explanation: message }
  return { code: match[1], explanation: match[2] }
}
