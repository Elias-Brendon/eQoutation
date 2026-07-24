import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  Flag,
  FlagOrigin,
  FlagOriginCounts,
  FlagSeverity,
  RaiseFlagInput
} from '@shared/types/entities'

interface FlagRow {
  id: string
  quotation_id: string
  quotation_line_id: string | null
  origin: FlagOrigin
  severity: FlagSeverity
  message: string
  page_number: number | null
  status: Flag['status']
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
}

function toFlag(row: FlagRow): Flag {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    quotationLineId: row.quotation_line_id,
    origin: row.origin,
    severity: row.severity,
    message: row.message,
    pageNumber: row.page_number,
    status: row.status,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  }
}

export interface CreateFlagInput {
  quotationLineId?: string | null
  origin: FlagOrigin
  severity?: FlagSeverity
  message: string
  pageNumber?: number | null
}

export function createFlags(quotationId: string, inputs: CreateFlagInput[]): Flag[] {
  const db = getDb()
  const now = new Date().toISOString()

  const insert = db.prepare(
    `INSERT INTO flags
       (id, quotation_id, quotation_line_id, origin, severity, message, page_number, status, resolution_note, created_at, resolved_at)
     VALUES
       (@id, @quotation_id, @quotation_line_id, @origin, @severity, @message, @page_number, 'open', NULL, @created_at, NULL)`
  )

  const rows: FlagRow[] = inputs.map((input) => ({
    id: randomUUID(),
    quotation_id: quotationId,
    quotation_line_id: input.quotationLineId ?? null,
    origin: input.origin,
    severity: input.severity ?? 'warning',
    message: input.message,
    page_number: input.pageNumber ?? null,
    status: 'open',
    resolution_note: null,
    created_at: now,
    resolved_at: null
  }))

  const run = db.transaction(() => {
    for (const row of rows) insert.run(row)
  })
  run()

  return rows.map(toFlag)
}

export function getFlagById(id: string): Flag | null {
  const row = getDb().prepare('SELECT * FROM flags WHERE id = ?').get(id) as FlagRow | undefined
  return row ? toFlag(row) : null
}

export function listFlagsByQuotation(quotationId: string): Flag[] {
  const rows = getDb()
    .prepare('SELECT * FROM flags WHERE quotation_id = ? ORDER BY created_at ASC')
    .all(quotationId) as FlagRow[]
  return rows.map(toFlag)
}

export function raiseHumanFlag(input: RaiseFlagInput): Flag {
  const [flag] = createFlags(input.quotationId, [
    {
      quotationLineId: input.quotationLineId ?? null,
      origin: 'human',
      severity: input.severity ?? 'warning',
      message: input.message,
      pageNumber: input.pageNumber ?? null
    }
  ])
  return flag
}

export function resolveFlag(id: string, resolutionNote?: string): void {
  getDb()
    .prepare(
      `UPDATE flags SET status = 'resolved', resolution_note = ?, resolved_at = ? WHERE id = ?`
    )
    .run(resolutionNote ?? null, new Date().toISOString(), id)
}

export function countOpenFlagsByProject(projectId: string): FlagOriginCounts {
  const rows = getDb()
    .prepare(
      `SELECT f.origin AS origin, COUNT(*) AS cnt
       FROM flags f
       JOIN quotations q ON q.id = f.quotation_id
       JOIN slds s ON s.id = q.sld_id
       WHERE s.project_id = ?
         AND s.deleted_at IS NULL
         AND f.status = 'open'
         AND f.quotation_id = (
           SELECT q2.id FROM quotations q2 WHERE q2.sld_id = s.id ORDER BY q2.created_at DESC LIMIT 1
         )
       GROUP BY f.origin`
    )
    .all(projectId) as { origin: FlagOrigin; cnt: number }[]

  const counts: FlagOriginCounts = { matcher: 0, ai: 0, human: 0 }
  for (const row of rows) counts[row.origin] = row.cnt
  return counts
}
