import { randomUUID } from 'crypto'
import { getDb } from '../index'
import { AppError } from '../../errors/AppError'
import type {
  CatalogItem,
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
  panel_name: string
  tag: string
  sku: string
  component_type: string
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
  ai_confidence: number
  created_at: string
}

function toLine(row: QuotationLineRow): QuotationLine {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    catalogItemId: row.catalog_item_id,
    pageNumber: row.page_number,
    panelName: row.panel_name,
    tag: row.tag,
    sku: row.sku,
    componentType: row.component_type,
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
    matchConfidence: row.match_confidence,
    aiConfidence: row.ai_confidence
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
  id: string
  catalogItemId: string | null
  pageNumber: number
  panelName: string
  tag: string
  sku: string
  componentType: string
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
  aiConfidence: number
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
       (id, quotation_id, catalog_item_id, page_number, panel_name, tag, sku, component_type, description, maker, qty, uom,
        list_price, discount_factor, unit_cost, total_cost, margin, quote_price,
        match_status, match_confidence, ai_confidence, created_at)
     VALUES
       (@id, @quotation_id, @catalog_item_id, @page_number, @panel_name, @tag, @sku, @component_type, @description, @maker, @qty, @uom,
        @list_price, @discount_factor, @unit_cost, @total_cost, @margin, @quote_price,
        @match_status, @match_confidence, @ai_confidence, @created_at)`
  )

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO quotations (id, sld_id, extraction_id, code, status, excel_file_path, created_at, updated_at)
       VALUES (@id, @sld_id, @extraction_id, @code, @status, @excel_file_path, @created_at, @updated_at)`
    ).run(row)

    for (const input of lineInputs) {
      insertLine.run({
        id: input.id,
        quotation_id: quotationId,
        catalog_item_id: input.catalogItemId,
        page_number: input.pageNumber,
        panel_name: input.panelName,
        tag: input.tag,
        sku: input.sku,
        component_type: input.componentType,
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
        ai_confidence: input.aiConfidence,
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

export function getQuotationLineById(id: string): QuotationLine | null {
  const row = getDb().prepare('SELECT * FROM quotation_lines WHERE id = ?').get(id) as
    QuotationLineRow | undefined
  return row ? toLine(row) : null
}

// Links a line to a catalog item and recomputes its pricing from that item,
// preserving the line's existing qty/margin (set at quotation-generation
// time, not something this resolve flow should reset).
export function applyLineMatch(lineId: string, catalogItem: CatalogItem, confidence: number): void {
  const db = getDb()
  const current = db.prepare('SELECT qty, margin FROM quotation_lines WHERE id = ?').get(lineId) as
    { qty: number; margin: number } | undefined
  if (!current) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

  const unitCost = catalogItem.unitPrice
  const totalCost = current.qty * unitCost
  const quotePrice = totalCost * current.margin

  db.prepare(
    `UPDATE quotation_lines
     SET catalog_item_id = @catalog_item_id, sku = @sku, description = @description, maker = @maker,
         uom = @uom, list_price = @list_price, discount_factor = @discount_factor,
         unit_cost = @unit_cost, total_cost = @total_cost, quote_price = @quote_price,
         match_status = 'matched', match_confidence = @match_confidence
     WHERE id = @id`
  ).run({
    id: lineId,
    catalog_item_id: catalogItem.id,
    sku: catalogItem.sku,
    description: catalogItem.description,
    maker: catalogItem.maker,
    uom: catalogItem.uom,
    list_price: catalogItem.listPrice,
    discount_factor: catalogItem.discountFactor,
    unit_cost: unitCost,
    total_cost: totalCost,
    quote_price: quotePrice,
    match_confidence: confidence
  })
}

export interface UpdateQuotationLineFields {
  description?: string
  qty?: number
  uom?: string
  tag?: string
}

// Human value-correction from a confidence-resolve action — unlike
// applyLineMatch, this never touches match_status/match_confidence/catalog_item_id,
// since it's correcting extracted values, not re-matching a catalog item.
export function updateQuotationLine(lineId: string, fields: UpdateQuotationLineFields): void {
  const current = getQuotationLineById(lineId)
  if (!current) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

  const qty = fields.qty ?? current.qty
  const totalCost = qty * current.unitCost
  const quotePrice = totalCost * current.margin

  getDb()
    .prepare(
      `UPDATE quotation_lines
       SET description = @description, qty = @qty, uom = @uom, tag = @tag,
           total_cost = @total_cost, quote_price = @quote_price
       WHERE id = @id`
    )
    .run({
      id: lineId,
      description: fields.description ?? current.description,
      qty,
      uom: fields.uom ?? current.uom,
      tag: fields.tag ?? current.tag,
      total_cost: totalCost,
      quote_price: quotePrice
    })
}

export function updateQuotationLineMargin(lineId: string, margin: number): void {
  const db = getDb()
  const current = db.prepare('SELECT total_cost FROM quotation_lines WHERE id = ?').get(lineId) as
    { total_cost: number } | undefined
  if (!current) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

  db.prepare('UPDATE quotation_lines SET margin = ?, quote_price = ? WHERE id = ?').run(
    margin,
    current.total_cost * margin,
    lineId
  )
}

// Bulk version of updateQuotationLineMargin, scoped to every line currently
// in one panel — recomputes quote_price per row from each row's own
// total_cost (a single UPDATE...WHERE, not a per-line loop).
export function updatePanelMargin(quotationId: string, panelName: string, margin: number): void {
  getDb()
    .prepare(
      `UPDATE quotation_lines
       SET margin = @margin, quote_price = total_cost * @margin
       WHERE quotation_id = @quotation_id AND panel_name = @panel_name`
    )
    .run({ margin, quotation_id: quotationId, panel_name: panelName })
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

function setQuotationStatus(id: string, status: QuotationStatus): void {
  getDb()
    .prepare('UPDATE quotations SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id)
}

export function approveQuotation(id: string): void {
  setQuotationStatus(id, 'approved')
}

export function rejectQuotation(id: string): void {
  setQuotationStatus(id, 'rejected')
}

export function deleteQuotation(id: string): void {
  getDb().prepare('DELETE FROM quotations WHERE id = ?').run(id)
}
