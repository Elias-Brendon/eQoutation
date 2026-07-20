import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  Quotation,
  QuotationLine,
  QuotationStatus,
  QuotationLineMatchStatus
} from '@shared/types/entities'

interface QuotationRow {
  id: string
  sld_id: string
  extraction_id: string | null
  code: string
  status: QuotationStatus
  excel_file_path: string | null
  created_at: string
  updated_at: string
}

interface QuotationLineRow {
  id: string
  quotation_id: string
  catalog_item_id: string | null
  page_number: number
  tag: string
  description: string
  maker: string
  qty: number
  uom: string
  list_price: number
  discount_factor: number
  unit_cost: number
  total_cost: number
  margin: number
  quote_price: number
  match_status: QuotationLineMatchStatus
  match_confidence: number
  created_at: string
}

function toLine(row: QuotationLineRow): QuotationLine {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    catalogItemId: row.catalog_item_id,
    pageNumber: row.page_number,
    tag: row.tag,
    description: row.description,
    maker: row.maker,
    qty: row.qty,
    uom: row.uom,
    listPrice: row.list_price,
    discountFactor: row.discount_factor,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
    margin: row.margin,
    quotePrice: row.quote_price,
    matchStatus: row.match_status,
    matchConfidence: row.match_confidence
  }
}

function toQuotation(row: QuotationRow, lines: QuotationLine[]): Quotation {
  return {
    id: row.id,
    sldId: row.sld_id,
    extractionId: row.extraction_id,
    code: row.code,
    status: row.status,
    excelFilePath: row.excel_file_path,
    lines,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface QuotationLineInput {
  catalogItemId: string | null
  pageNumber: number
  tag: string
  description: string
  maker: string
  qty: number
  uom: string
  listPrice: number
  discountFactor: number
  unitCost: number
  totalCost: number
  margin: number
  quotePrice: number
  matchStatus: QuotationLineMatchStatus
  matchConfidence: number
}

export function createQuotationWithLines(
  sldId: string,
  extractionId: string,
  code: string,
  lineInputs: QuotationLineInput[]
): Quotation {
  const db = getDb()
  const now = new Date().toISOString()
  const quotationId = randomUUID()

  const row: QuotationRow = {
    id: quotationId,
    sld_id: sldId,
    extraction_id: extractionId,
    code,
    status: 'pending_review',
    excel_file_path: null,
    created_at: now,
    updated_at: now
  }

  const insertLine = db.prepare(
    `INSERT INTO quotation_lines
       (id, quotation_id, catalog_item_id, page_number, tag, description, maker, qty, uom,
        list_price, discount_factor, unit_cost, total_cost, margin, quote_price,
        match_status, match_confidence, created_at)
     VALUES
       (@id, @quotation_id, @catalog_item_id, @page_number, @tag, @description, @maker, @qty, @uom,
        @list_price, @discount_factor, @unit_cost, @total_cost, @margin, @quote_price,
        @match_status, @match_confidence, @created_at)`
  )

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO quotations (id, sld_id, extraction_id, code, status, excel_file_path, created_at, updated_at)
       VALUES (@id, @sld_id, @extraction_id, @code, @status, @excel_file_path, @created_at, @updated_at)`
    ).run(row)

    for (const input of lineInputs) {
      insertLine.run({
        id: randomUUID(),
        quotation_id: quotationId,
        catalog_item_id: input.catalogItemId,
        page_number: input.pageNumber,
        tag: input.tag,
        description: input.description,
        maker: input.maker,
        qty: input.qty,
        uom: input.uom,
        list_price: input.listPrice,
        discount_factor: input.discountFactor,
        unit_cost: input.unitCost,
        total_cost: input.totalCost,
        margin: input.margin,
        quote_price: input.quotePrice,
        match_status: input.matchStatus,
        match_confidence: input.matchConfidence,
        created_at: now
      })
    }
  })
  run()

  return getQuotationById(quotationId) as Quotation
}

function getLinesForQuotation(quotationId: string): QuotationLine[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY page_number ASC, created_at ASC'
    )
    .all(quotationId) as QuotationLineRow[]
  return rows.map(toLine)
}

export function getQuotationById(id: string): Quotation | null {
  const row = getDb().prepare('SELECT * FROM quotations WHERE id = ?').get(id) as
    QuotationRow | undefined
  if (!row) return null
  return toQuotation(row, getLinesForQuotation(id))
}

export function getLatestQuotationForSld(sldId: string): Quotation | null {
  const row = getDb()
    .prepare('SELECT * FROM quotations WHERE sld_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sldId) as QuotationRow | undefined
  if (!row) return null
  return toQuotation(row, getLinesForQuotation(row.id))
}

export function listQuotationsByProject(projectId: string): Quotation[] {
  const rows = getDb()
    .prepare(
      `SELECT q.* FROM quotations q
       JOIN slds s ON s.id = q.sld_id
       WHERE s.project_id = ?
       ORDER BY q.created_at DESC`
    )
    .all(projectId) as QuotationRow[]
  return rows.map((row) => toQuotation(row, getLinesForQuotation(row.id)))
}

export function setQuotationExcelPath(id: string, filePath: string): void {
  getDb()
    .prepare('UPDATE quotations SET excel_file_path = ?, updated_at = ? WHERE id = ?')
    .run(filePath, new Date().toISOString(), id)
}
