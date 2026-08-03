import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { EventLogEntry, EventLogLevel } from '@shared/types/entities'

interface EventLogRow {
  id: string
  level: EventLogLevel
  source: string
  message: string
  error_code: string | null
  context: string | null
  created_at: string
}

function toEventLogEntry(row: EventLogRow): EventLogEntry {
  return {
    id: row.id,
    level: row.level,
    source: row.source,
    message: row.message,
    errorCode: row.error_code,
    context: row.context,
    createdAt: row.created_at
  }
}

export interface LogEventInput {
  level: EventLogLevel
  source: string
  message: string
  errorCode?: string
  context?: unknown
}

export function logEvent(input: LogEventInput): void {
  const row: EventLogRow = {
    id: randomUUID(),
    level: input.level,
    source: input.source,
    message: input.message,
    error_code: input.errorCode ?? null,
    context: input.context !== undefined ? JSON.stringify(input.context) : null,
    created_at: new Date().toISOString()
  }

  getDb()
    .prepare(
      `INSERT INTO event_log (id, level, source, message, error_code, context, created_at)
       VALUES (@id, @level, @source, @message, @error_code, @context, @created_at)`
    )
    .run(row)
}

export function listEvents(limit = 500): EventLogEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT ?')
    .all(limit) as EventLogRow[]
  return rows.map(toEventLogEntry)
}
