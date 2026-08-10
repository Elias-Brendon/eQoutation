// Single source of truth for every user-facing error in the app: each key
// maps to a short domain-prefixed code and a terse explanation that never
// leaks internal detail (raw IDs, stack traces, library error text).
// Consumed by main-process error throwing (src/main/errors/AppError.ts),
// by result-object error fields that don't throw (e.g. catalog reload,
// API key testing — see formatErrorCode below), and by the User Manual's
// Error Codes reference table — never edit these separately.
export const ERROR_CODES = {
  // Auth
  AUTH_SETUP_ALREADY_DONE: { code: 'AUTH-001', message: 'Setup already completed' },
  AUTH_USERNAME_REQUIRED: { code: 'AUTH-002', message: 'Username required' },
  AUTH_PASSWORD_TOO_SHORT: { code: 'AUTH-003', message: 'Password too short' },
  AUTH_SECURITY_QUESTION_REQUIRED: { code: 'AUTH-004', message: 'Security question required' },
  AUTH_SECURITY_ANSWER_REQUIRED: { code: 'AUTH-005', message: 'Security answer required' },
  AUTH_INVALID_CREDENTIALS: { code: 'AUTH-006', message: 'Wrong username or password' },
  AUTH_USER_NOT_FOUND: { code: 'AUTH-007', message: 'Account not found' },
  AUTH_RECOVERY_ANSWER_MISMATCH: { code: 'AUTH-008', message: "Answer doesn't match" },
  AUTH_NOT_LOGGED_IN: { code: 'AUTH-009', message: 'Not logged in' },
  AUTH_CURRENT_PASSWORD_INCORRECT: { code: 'AUTH-010', message: 'Current password incorrect' },

  // AI extraction
  AI_NO_API_KEY: { code: 'AI-001', message: 'AI API key not set' },
  AI_UNREACHABLE: { code: 'AI-002', message: 'AI provider unreachable' },
  AI_RATE_LIMITED: { code: 'AI-003', message: 'AI provider rate limited' },
  AI_INVALID_API_KEY: { code: 'AI-004', message: 'AI API key rejected' },
  AI_EXTRACTION_TRUNCATED: { code: 'AI-005', message: 'Response too large, cut off' },
  AI_RESPONSE_UNREADABLE: { code: 'AI-006', message: 'Unreadable AI response' },
  AI_REQUEST_FAILED: { code: 'AI-007', message: 'Extraction failed' },
  AI_KEY_TEST_FAILED: { code: 'AI-008', message: 'AI key test failed' },
  AI_ALREADY_EXTRACTED: {
    code: 'AI-009',
    message: 'SLD already extracted  re-extraction requires confirmation'
  },
  AI_PAGE_RENDER_FAILED: { code: 'AI-010', message: 'Could not render PDF pages for extraction' },

  // Records that no longer exist
  DB_PROJECT_NOT_FOUND: { code: 'DB-001', message: 'Project not found' },
  DB_SLD_NOT_FOUND: { code: 'DB-002', message: 'Drawing not found' },
  DB_QUOTATION_NOT_FOUND: { code: 'DB-003', message: 'Quotation not found' },
  DB_QUOTATION_LINE_NOT_FOUND: { code: 'DB-004', message: 'Line item not found' },
  DB_FLAG_NOT_FOUND: { code: 'DB-005', message: 'Flag not found' },
  DB_FLAG_NOT_LINKED: { code: 'DB-006', message: 'Flag not linked to a line' },
  DB_CATALOG_ITEM_NOT_FOUND: { code: 'DB-007', message: 'Catalog item not found' },

  // Catalog file
  CAT_NO_SOURCE_FILE: { code: 'CAT-001', message: 'No catalog file loaded' },
  CAT_NO_SHEET: { code: 'CAT-002', message: 'Catalog file has no sheet' },
  CAT_NO_HEADER_ROW: { code: 'CAT-003', message: 'Catalog header row not found' },
  CAT_NO_XLSX_IN_DIR: { code: 'CAT-004', message: 'No catalog file found' },
  CAT_PARSE_FAILED: { code: 'CAT-005', message: 'Could not read catalog file' },
  CAT_SOURCE_FILE_MISSING: {
    code: 'CAT-006',
    message: 'Catalog file has moved or been deleted, click Reload in the Catalog panel'
  },

  // Quotation business rules
  QT_NOT_EXTRACTED: { code: 'QT-001', message: 'Run extraction first' },

  // Secrets / API keys
  SEC_ENCRYPTION_UNAVAILABLE: { code: 'SEC-001', message: 'Secure storage unavailable' },
  SEC_KEY_EMPTY: { code: 'SEC-002', message: 'Key is empty' },

  // Currency exchange rates
  FX_UNREACHABLE: { code: 'FX-001', message: 'Currency service unreachable' },
  FX_BAD_RESPONSE: { code: 'FX-002', message: 'Currency service error' },
  FX_SERVICE_ERROR: { code: 'FX-003', message: 'Currency service unavailable' },

  // Fallback for anything not covered above
  GEN_UNEXPECTED: { code: 'GEN-001', message: 'Unexpected error' }
} as const satisfies Record<string, { code: string; message: string }>

export type ErrorKey = keyof typeof ERROR_CODES

// "Error <CODE>: <explanation>" — the one place this format is assembled.
// Used both by AppError (thrown errors) and by result objects that resolve
// with an `error` string instead of throwing (catalog reload, API key
// testing) so every error surface in the app looks identical.
export function formatErrorCode(key: ErrorKey): string {
  const entry = ERROR_CODES[key]
  return `Error ${entry.code}: ${entry.message}`
}
