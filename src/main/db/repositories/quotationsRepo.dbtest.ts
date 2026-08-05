import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { insertCatalogItem } from './catalogRepo'
import {
  addQuotationLine,
  getQuotationById,
  getQuotationLineById,
  removeQuotationLine
} from './quotationsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

// Minimal project -> sld -> quotation chain so a quotation_line can legally
// reference a real quotation_id (NOT NULL FK). Mirrors the fixture pattern
// already used in catalogRepo.dbtest.ts / feedbackLogRepo.dbtest.ts.
function createQuotation(): string {
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
    "INSERT INTO quotations (id, sld_id, code, created_at, updated_at) VALUES (?, ?, 'Q-TEST', ?, ?)"
  ).run(quotationId, sldId, now, now)

  return quotationId
}

describe('addQuotationLine', () => {
  it('creates a matched line priced from the catalog item, using the given margin', () => {
    const quotationId = createQuotation()
    const catalogItem = insertCatalogItem({
      sku: 'SKU-1',
      description: 'Test breaker',
      unitPrice: 10,
      uom: 'nos'
    })

    const line = addQuotationLine(
      quotationId,
      catalogItem.id,
      { pageNumber: 2, panelName: '250A DB-G1', qty: 3 },
      1.5
    )

    expect(line.quotationId).toBe(quotationId)
    expect(line.catalogItemId).toBe(catalogItem.id)
    expect(line.pageNumber).toBe(2)
    expect(line.panelName).toBe('250A DB-G1')
    expect(line.qty).toBe(3)
    expect(line.description).toBe('Test breaker')
    expect(line.sku).toBe('SKU-1')
    expect(line.unitCost).toBe(10)
    expect(line.totalCost).toBe(30)
    expect(line.margin).toBe(1.5)
    expect(line.quotePrice).toBe(45)
    expect(line.matchStatus).toBe('matched')
    expect(line.matchConfidence).toBe(1)
    expect(line.aiConfidence).toBe(1)
  })

  it('throws DB_CATALOG_ITEM_NOT_FOUND for a bad catalog item id', () => {
    const quotationId = createQuotation()
    expect(() =>
      addQuotationLine(quotationId, randomUUID(), { pageNumber: 1, panelName: 'X', qty: 1 }, 1.35)
    ).toThrow('DB-007')
  })
})

// No dbtest for addQuotationLineWithNewCatalogItem: it calls addCatalogItem
// (catalogWriter.ts), which reads/writes an actual .xlsx source file via
// getCatalogStatus()/ExcelJS — not something this repo's dbtest fixtures set
// up. Matches flags.ipc.ts's addCatalogItemAndLink, which calls the same
// function and also has no dbtest. Covered by Task 7's live verification.

describe('removeQuotationLine', () => {
  it('sets removed_at and excludes the line from getLinesForQuotation/getQuotationById afterward', () => {
    const quotationId = createQuotation()
    const catalogItem = insertCatalogItem({ sku: 'SKU-2', description: 'Removable', unitPrice: 5 })
    const line = addQuotationLine(
      quotationId,
      catalogItem.id,
      { pageNumber: 1, panelName: 'X', qty: 1 },
      1.35
    )

    removeQuotationLine(line.id)

    const quotation = getQuotationById(quotationId)
    expect(quotation?.lines.find((l) => l.id === line.id)).toBeUndefined()
  })

  it('still returns the removed line via getQuotationLineById (unfiltered lookup)', () => {
    const quotationId = createQuotation()
    const catalogItem = insertCatalogItem({ sku: 'SKU-3', description: 'Still findable', unitPrice: 5 })
    const line = addQuotationLine(
      quotationId,
      catalogItem.id,
      { pageNumber: 1, panelName: 'X', qty: 1 },
      1.35
    )

    removeQuotationLine(line.id)

    expect(getQuotationLineById(line.id)).not.toBeNull()
  })

  it('throws DB_QUOTATION_LINE_NOT_FOUND for a bad line id', () => {
    expect(() => removeQuotationLine(randomUUID())).toThrow('DB-004')
  })
})
