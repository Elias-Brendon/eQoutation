import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  Extraction,
  ExtractionStatus,
  ExtractedComponent,
  ExtractionFlag
} from '@shared/types/entities'

interface ExtractionRow {
  id: string
  sld_id: string
  status: ExtractionStatus
  model: string | null
  raw_json: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

interface RawExtractionPayload {
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
}

function toExtraction(row: ExtractionRow): Extraction {
  const parsed: RawExtractionPayload = row.raw_json
    ? JSON.parse(row.raw_json)
    : { components: [], flags: [] }
  return {
    id: row.id,
    sldId: row.sld_id,
    status: row.status,
    model: row.model,
    components: parsed.components,
    flags: parsed.flags,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at
  }
}

export function createRunningExtraction(sldId: string): Extraction {
  const row: ExtractionRow = {
    id: randomUUID(),
    sld_id: sldId,
    status: 'running',
    model: null,
    raw_json: null,
    error: null,
    created_at: new Date().toISOString(),
    completed_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO extractions (id, sld_id, status, model, raw_json, error, created_at, completed_at)
       VALUES (@id, @sld_id, @status, @model, @raw_json, @error, @created_at, @completed_at)`
    )
    .run(row)

  return toExtraction(row)
}

export function completeExtraction(id: string, model: string, payload: RawExtractionPayload): void {
  getDb()
    .prepare(
      `UPDATE extractions SET status = 'done', model = ?, raw_json = ?, completed_at = ? WHERE id = ?`
    )
    .run(model, JSON.stringify(payload), new Date().toISOString(), id)
}

export function failExtraction(id: string, error: string): void {
  getDb()
    .prepare(`UPDATE extractions SET status = 'error', error = ?, completed_at = ? WHERE id = ?`)
    .run(error, new Date().toISOString(), id)
}

export function getLatestExtractionForSld(sldId: string): Extraction | null {
  const row = getDb()
    .prepare('SELECT * FROM extractions WHERE sld_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sldId) as ExtractionRow | undefined
  return row ? toExtraction(row) : null
}
