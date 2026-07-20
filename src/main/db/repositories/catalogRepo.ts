import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { CatalogItem } from '@shared/types/entities'

interface CatalogItemRow {
  id: string
  sku: string
  description: string
  maker: string
  family: string
  series: string
  list_price: number
  discount_factor: number
  unit_price: number
  uom: string
  source_row: number | null
  updated_at: string
}

function toCatalogItem(row: CatalogItemRow): CatalogItem {
  return {
    id: row.id,
    sku: row.sku,
    description: row.description,
    maker: row.maker,
    family: row.family,
    series: row.series,
    listPrice: row.list_price,
    discountFactor: row.discount_factor,
    unitPrice: row.unit_price,
    uom: row.uom,
    sourceRow: row.source_row,
    updatedAt: row.updated_at
  }
}

export interface CatalogItemInput {
  sku: string
  description: string
  maker?: string
  family?: string
  series?: string
  listPrice?: number
  discountFactor?: number
  unitPrice?: number
  uom?: string
  sourceRow?: number
}

export function replaceCatalogItems(items: CatalogItemInput[]): number {
  const db = getDb()
  const now = new Date().toISOString()

  const insert = db.prepare(
    `INSERT INTO catalog_items
       (id, sku, description, maker, family, series, list_price, discount_factor, unit_price, uom, source_row, updated_at)
     VALUES
       (@id, @sku, @description, @maker, @family, @series, @list_price, @discount_factor, @unit_price, @uom, @source_row, @updated_at)`
  )

  const runAll = db.transaction((rows: CatalogItemInput[]) => {
    db.prepare('DELETE FROM catalog_items').run()
    for (const row of rows) {
      insert.run({
        id: randomUUID(),
        sku: row.sku,
        description: row.description,
        maker: row.maker ?? '',
        family: row.family ?? '',
        series: row.series ?? '',
        list_price: row.listPrice ?? 0,
        discount_factor: row.discountFactor ?? 1,
        unit_price: row.unitPrice ?? 0,
        uom: row.uom ?? '',
        source_row: row.sourceRow ?? null,
        updated_at: now
      })
    }
  })

  runAll(items)
  return items.length
}

export function getAllCatalogItems(): CatalogItem[] {
  const rows = getDb().prepare('SELECT * FROM catalog_items').all() as CatalogItemRow[]
  return rows.map(toCatalogItem)
}

export function countCatalogItems(): number {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM catalog_items').get() as {
    count: number
  }
  return row.count
}

export function searchCatalogItems(query: string, limit = 100): CatalogItem[] {
  const db = getDb()
  const trimmed = query.trim()

  if (!trimmed) {
    const rows = db
      .prepare('SELECT * FROM catalog_items ORDER BY description ASC LIMIT ?')
      .all(limit) as CatalogItemRow[]
    return rows.map(toCatalogItem)
  }

  const like = `%${trimmed}%`
  const rows = db
    .prepare(
      `SELECT * FROM catalog_items
       WHERE sku LIKE @like OR description LIKE @like OR maker LIKE @like OR family LIKE @like
       ORDER BY description ASC
       LIMIT @limit`
    )
    .all({ like, limit }) as CatalogItemRow[]
  return rows.map(toCatalogItem)
}

export function recordCatalogSync(sourcePath: string, itemCount: number): void {
  getDb()
    .prepare('INSERT INTO catalog_sync_log (source_path, item_count, synced_at) VALUES (?, ?, ?)')
    .run(sourcePath, itemCount, new Date().toISOString())
}

export function getLastCatalogSync(): {
  sourcePath: string
  itemCount: number
  syncedAt: string
} | null {
  const row = getDb()
    .prepare(
      'SELECT source_path, item_count, synced_at FROM catalog_sync_log ORDER BY id DESC LIMIT 1'
    )
    .get() as { source_path: string; item_count: number; synced_at: string } | undefined
  if (!row) return null
  return { sourcePath: row.source_path, itemCount: row.item_count, syncedAt: row.synced_at }
}
