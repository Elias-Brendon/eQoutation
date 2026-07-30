import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { createFlags } from './flagsRepo'
import { createFeedbackLog, listFeedbackByLine } from './feedbackLogRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

function createProjectSldQuotationLine(): { quotationId: string; lineId: string } {
  const db = getDb()
  const now = new Date().toISOString()
  const projectId = randomUUID()
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    'Test Project',
    now,
    now
  )
  const sldId = randomUUID()
  db.prepare(
    'INSERT INTO slds (id, project_id, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sldId, projectId, 'test.pdf', now, now)
  const quotationId = randomUUID()
  db.prepare(
    `INSERT INTO quotations (id, sld_id, extraction_id, code, status, excel_file_path, created_at, updated_at)
     VALUES (?, ?, NULL, 'Q-TEST', 'pending_review', NULL, ?, ?)`
  ).run(quotationId, sldId, now, now)
  const lineId = randomUUID()
  db.prepare(
    `INSERT INTO quotation_lines
       (id, quotation_id, catalog_item_id, page_number, tag, description, maker, qty, uom,
        list_price, discount_factor, unit_cost, total_cost, margin, quote_price, match_status, match_confidence,
        ai_confidence, panel_name, sku, component_type, created_at)
     VALUES (?, ?, NULL, 1, '', 'desc', '', 1, 'PC', 0, 1, 0, 0, 1, 0, 'matched', 1, 1, '', '', '', ?)`
  ).run(lineId, quotationId, now)
  return { quotationId, lineId }
}

describe('createFeedbackLog', () => {
  it('creates a line-level entry as before', () => {
    const { lineId } = createProjectSldQuotationLine()
    const entry = createFeedbackLog({
      quotationLineId: lineId,
      fieldChanged: 'description',
      aiValue: 'old',
      humanValue: 'new',
      action: 'corrected'
    })
    expect(entry.quotationLineId).toBe(lineId)
    expect(entry.flagId).toBeNull()
    expect(listFeedbackByLine(lineId)).toHaveLength(1)
  })

  it('creates a page-level entry with a flag_id and no quotation_line_id', () => {
    const { quotationId } = createProjectSldQuotationLine()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'MSB panel name found', pageNumber: 1 }
    ])

    const entry = createFeedbackLog({
      flagId: flag.id,
      fieldChanged: 'annotation',
      aiValue: flag.message,
      humanValue: flag.message,
      action: 'accepted'
    })

    expect(entry.quotationLineId).toBeNull()
    expect(entry.flagId).toBe(flag.id)
  })
})
