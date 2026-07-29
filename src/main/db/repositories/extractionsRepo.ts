import { randomUUID } from 'crypto'
import { getDb } from '../index'
import { AppError } from '../../errors/AppError'
import type {
  Extraction,
  ExtractionStatus,
  ExtractedComponent,
  ExtractionFlag,
  ProjectTokenUsage
} from '@shared/types/entities'

interface ExtractionRow {
  id: string
  sld_id: string
  status: ExtractionStatus
  model: string | null
  raw_json: string | null
  error: string | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  completed_at: string | null
}

interface RawExtractionPayload {
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
}

export interface ExtractionUsage {
  inputTokens: number
  outputTokens: number
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
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
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
    input_tokens: null,
    output_tokens: null,
    created_at: new Date().toISOString(),
    completed_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO extractions
         (id, sld_id, status, model, raw_json, error, input_tokens, output_tokens, created_at, completed_at)
       VALUES
         (@id, @sld_id, @status, @model, @raw_json, @error, @input_tokens, @output_tokens, @created_at, @completed_at)`
    )
    .run(row)

  return toExtraction(row)
}

export function completeExtraction(
  id: string,
  model: string,
  payload: RawExtractionPayload,
  usage: ExtractionUsage | null
): void {
  getDb()
    .prepare(
      `UPDATE extractions
       SET status = 'done', model = ?, raw_json = ?, input_tokens = ?, output_tokens = ?, completed_at = ?
       WHERE id = ?`
    )
    .run(
      model,
      JSON.stringify(payload),
      usage?.inputTokens ?? null,
      usage?.outputTokens ?? null,
      new Date().toISOString(),
      id
    )
}

export function failExtraction(id: string, error: string, usage: ExtractionUsage | null): void {
  getDb()
    .prepare(
      `UPDATE extractions
       SET status = 'error', error = ?, input_tokens = ?, output_tokens = ?, completed_at = ?
       WHERE id = ?`
    )
    .run(error, usage?.inputTokens ?? null, usage?.outputTokens ?? null, new Date().toISOString(), id)
}

export function getLatestExtractionForSld(sldId: string): Extraction | null {
  const row = getDb()
    .prepare('SELECT * FROM extractions WHERE sld_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sldId) as ExtractionRow | undefined
  return row ? toExtraction(row) : null
}

// Domain rule: an SLD may only be extracted once successfully. Called before
// any API request is made so a locked SLD never spends tokens on a blocked
// attempt. A prior failed/running extraction does not lock — only 'done' does.
export function assertCanExtract(sldId: string, force: boolean): void {
  if (force) return
  const latest = getLatestExtractionForSld(sldId)
  if (latest?.status === 'done') {
    throw new AppError('AI_ALREADY_EXTRACTED')
  }
}

export function getProjectTokenUsage(projectId: string): ProjectTokenUsage {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(e.input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(e.output_tokens), 0) AS total_output_tokens,
         COUNT(*) AS extraction_count
       FROM extractions e
       JOIN slds s ON s.id = e.sld_id
       WHERE s.project_id = ? AND s.deleted_at IS NULL AND e.status IN ('done', 'error')`
    )
    .get(projectId) as {
    total_input_tokens: number
    total_output_tokens: number
    extraction_count: number
  }

  return {
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    extractionCount: row.extraction_count
  }
}
