import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './index'
import { migrations } from './migrations'

beforeAll(() => {
  process.env.EQOUTATION_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
})

describe('migration runner', () => {
  it('applies every migration cleanly to a fresh in-memory database', () => {
    const db = getDb()
    const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all() as {
      version: number
    }[]
    const appliedVersions = rows.map((r) => r.version)
    const expectedVersions = [...migrations.map((m) => m.version)].sort((a, b) => a - b)
    expect(appliedVersions).toEqual(expectedVersions)
  })

  it('creates the catalog_items table with the columns replaceCatalogItems expects', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(catalog_items)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toEqual(
      expect.arrayContaining(['id', 'sku', 'description', 'list_price', 'unit_price'])
    )
  })
})
