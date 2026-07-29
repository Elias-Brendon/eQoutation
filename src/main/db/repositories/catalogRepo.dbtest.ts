import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { getAllCatalogItems, insertCatalogItem, replaceCatalogItems } from './catalogRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

// Minimal project -> sld -> quotation -> quotation_line chain so a
// quotation_line can legally reference a real quotation_id (NOT NULL FK),
// with catalog_item_id pointing at the given catalog item.
function createQuotationLineReferencing(catalogItemId: string): void {
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

  db.prepare(
    `INSERT INTO quotation_lines
       (id, quotation_id, catalog_item_id, description, match_status, match_confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), quotationId, catalogItemId, 'Test Line', 'matched', 1, now)
}

describe('replaceCatalogItems', () => {
  it('does not throw and preserves the id of a still-referenced item, even if its SKU is dropped from the new source data', () => {
    const referenced = insertCatalogItem({ sku: 'KEEP-ME', description: 'Referenced item' })
    createQuotationLineReferencing(referenced.id)

    expect(() =>
      replaceCatalogItems([{ sku: 'SOME-OTHER-SKU', description: 'Unrelated' }])
    ).not.toThrow()

    const stillThere = getAllCatalogItems().find((i) => i.id === referenced.id)
    expect(stillThere).toBeDefined()
    expect(stillThere?.sku).toBe('KEEP-ME')
  })

  it('removes a stale item that nothing references', () => {
    insertCatalogItem({ sku: 'STALE-UNREFERENCED', description: 'No longer in source' })

    replaceCatalogItems([{ sku: 'FRESH-ITEM', description: 'From the latest reload' }])

    const items = getAllCatalogItems()
    expect(items.find((i) => i.sku === 'STALE-UNREFERENCED')).toBeUndefined()
    expect(items.find((i) => i.sku === 'FRESH-ITEM')).toBeDefined()
  })

  it('updates an existing SKU in place, keeping its id unchanged', () => {
    const original = insertCatalogItem({
      sku: 'SAME-SKU',
      description: 'Old description',
      unitPrice: 10
    })

    replaceCatalogItems([{ sku: 'SAME-SKU', description: 'New description', unitPrice: 20 }])

    const updated = getAllCatalogItems().find((i) => i.sku === 'SAME-SKU')
    expect(updated?.id).toBe(original.id)
    expect(updated?.description).toBe('New description')
    expect(updated?.unitPrice).toBe(20)
  })
})
