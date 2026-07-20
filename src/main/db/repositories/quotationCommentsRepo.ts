import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { QuotationComment } from '@shared/types/entities'

interface QuotationCommentRow {
  id: string
  quotation_id: string
  body: string
  created_at: string
}

function toComment(row: QuotationCommentRow): QuotationComment {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    body: row.body,
    createdAt: row.created_at
  }
}

export function addComment(quotationId: string, body: string): QuotationComment {
  const row: QuotationCommentRow = {
    id: randomUUID(),
    quotation_id: quotationId,
    body,
    created_at: new Date().toISOString()
  }

  getDb()
    .prepare(
      `INSERT INTO quotation_comments (id, quotation_id, body, created_at)
       VALUES (@id, @quotation_id, @body, @created_at)`
    )
    .run(row)

  return toComment(row)
}

export function listComments(quotationId: string): QuotationComment[] {
  const rows = getDb()
    .prepare('SELECT * FROM quotation_comments WHERE quotation_id = ? ORDER BY created_at ASC')
    .all(quotationId) as QuotationCommentRow[]
  return rows.map(toComment)
}
