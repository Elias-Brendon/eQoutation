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

  it('makes feedback_log.quotation_line_id nullable and adds flag_id', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(feedback_log)').all() as {
      name: string
      notnull: number
    }[]
    const quotationLineIdCol = columns.find((c) => c.name === 'quotation_line_id')
    expect(quotationLineIdCol?.notnull).toBe(0)
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['flag_id']))
  })

  it('accepts a feedback_log row with a null quotation_line_id and a flag_id', () => {
    const db = getDb()
    db.prepare(
      `INSERT INTO feedback_log (id, quotation_line_id, flag_id, field_changed, ai_value, human_value, action, note, created_at)
       VALUES ('fb-1', NULL, NULL, 'annotation', 'a', 'b', 'accepted', NULL, '2026-01-01T00:00:00.000Z')`
    ).run()
    const row = db.prepare('SELECT * FROM feedback_log WHERE id = ?').get('fb-1')
    expect(row).toBeTruthy()
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
