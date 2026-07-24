import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { FeedbackAction, FeedbackLogEntry } from '@shared/types/entities'

interface FeedbackLogRow {
  id: string
  quotation_line_id: string
  field_changed: string
  ai_value: string
  human_value: string
  action: FeedbackAction
  note: string | null
  created_at: string
}

function toFeedbackLogEntry(row: FeedbackLogRow): FeedbackLogEntry {
  return {
    id: row.id,
    quotationLineId: row.quotation_line_id,
    fieldChanged: row.field_changed,
    aiValue: row.ai_value,
    humanValue: row.human_value,
    action: row.action,
    note: row.note,
    createdAt: row.created_at
  }
}

export interface CreateFeedbackLogInput {
  quotationLineId: string
  fieldChanged: string
  aiValue: string
  humanValue: string
  action: FeedbackAction
  note?: string | null
}

export function createFeedbackLog(input: CreateFeedbackLogInput): FeedbackLogEntry {
  const row: FeedbackLogRow = {
    id: randomUUID(),
    quotation_line_id: input.quotationLineId,
    field_changed: input.fieldChanged,
    ai_value: input.aiValue,
    human_value: input.humanValue,
    action: input.action,
    note: input.note ?? null,
    created_at: new Date().toISOString()
  }

  getDb()
    .prepare(
      `INSERT INTO feedback_log
         (id, quotation_line_id, field_changed, ai_value, human_value, action, note, created_at)
       VALUES
         (@id, @quotation_line_id, @field_changed, @ai_value, @human_value, @action, @note, @created_at)`
    )
    .run(row)

  return toFeedbackLogEntry(row)
}

export function listFeedbackByLine(quotationLineId: string): FeedbackLogEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM feedback_log WHERE quotation_line_id = ? ORDER BY created_at ASC')
    .all(quotationLineId) as FeedbackLogRow[]
  return rows.map(toFeedbackLogEntry)
}
