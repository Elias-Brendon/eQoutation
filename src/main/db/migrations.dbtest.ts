import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './index'
import { migrations } from './migrations'

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

  it('adds input_tokens and output_tokens columns to extractions', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(extractions)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toEqual(expect.arrayContaining(['input_tokens', 'output_tokens']))
  })

  it('adds linked_flag_id and resolved_at columns to annotations', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(annotations)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toEqual(expect.arrayContaining(['linked_flag_id', 'resolved_at']))
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
