import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  UpdateProjectCurrencySettingsInput
} from '@shared/types/entities'

interface ProjectRow {
  id: string
  name: string
  substation_label: string
  currency: string
  exchange_rate: number
  exchange_rate_is_manual: number
  exchange_rate_updated_at: string | null
  ai_progress_pct: number
  created_at: string
  updated_at: string
  ai_model_override: string | null
  sector: string | null
  quotation_number: string
  company: string | null
  coordinator: string | null
  status: string
  created_by: string | null
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    substationLabel: row.substation_label,
    currency: row.currency,
    exchangeRate: row.exchange_rate,
    exchangeRateIsManual: Boolean(row.exchange_rate_is_manual),
    exchangeRateUpdatedAt: row.exchange_rate_updated_at,
    aiProgressPct: row.ai_progress_pct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aiModelOverride: row.ai_model_override,
    sector: row.sector,
    quotationNumber: row.quotation_number,
    company: row.company,
    coordinator: row.coordinator,
    status: row.status as ProjectStatus,
    createdBy: row.created_by
  }
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY created_at DESC')
    .all() as ProjectRow[]
  return rows.map(toProject)
}

export function getProjectById(id: string): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    ProjectRow | undefined
  return row ? toProject(row) : null
}

function nextQuotationNumber(): string {
  const rows = getDb().prepare('SELECT quotation_number FROM projects').all() as {
    quotation_number: string
  }[]
  const maxN = rows.reduce((max, row) => {
    const match = /^PRJ-(\d+)$/.exec(row.quotation_number)
    const n = match ? parseInt(match[1], 10) : 0
    return Math.max(max, n)
  }, 0)
  return `PRJ-${String(maxN + 1).padStart(4, '0')}`
}

export function createProject(input: CreateProjectInput, createdBy: string | null = null): Project {
  const now = new Date().toISOString()
  const row: ProjectRow = {
    id: randomUUID(),
    name: input.name,
    substation_label: input.substationLabel ?? '',
    currency: 'MYR',
    exchange_rate: 1,
    exchange_rate_is_manual: 0,
    exchange_rate_updated_at: null,
    ai_progress_pct: 0,
    created_at: now,
    updated_at: now,
    ai_model_override: null,
    sector: input.sector ?? null,
    quotation_number: nextQuotationNumber(),
    company: input.company ?? null,
    coordinator: input.coordinator ?? null,
    status: 'pending_review',
    created_by: createdBy
  }

  getDb()
    .prepare(
      `INSERT INTO projects
         (id, name, substation_label, currency, exchange_rate, exchange_rate_is_manual,
          exchange_rate_updated_at, ai_progress_pct, created_at, updated_at, ai_model_override,
          sector, quotation_number, company, coordinator, status, created_by)
       VALUES
         (@id, @name, @substation_label, @currency, @exchange_rate, @exchange_rate_is_manual,
          @exchange_rate_updated_at, @ai_progress_pct, @created_at, @updated_at, @ai_model_override,
          @sector, @quotation_number, @company, @coordinator, @status, @created_by)`
    )
    .run(row)

  return toProject(row)
}

// Handles switching currency (rate passed in, live-fetched by the caller),
// refreshing the live rate (exchangeRateIsManual: false), and setting a
// manual override (exchangeRateIsManual: true) — MYR always forces rate=1.
export function updateProjectCurrencySettings(
  id: string,
  input: Omit<UpdateProjectCurrencySettingsInput, 'projectId'>
): Project {
  const isMyr = input.currency === 'MYR'
  const rate = isMyr ? 1 : (input.exchangeRate ?? 1)
  const isManual = isMyr ? false : input.exchangeRateIsManual

  getDb()
    .prepare(
      `UPDATE projects
       SET currency = @currency, exchange_rate = @exchange_rate,
           exchange_rate_is_manual = @exchange_rate_is_manual,
           exchange_rate_updated_at = @exchange_rate_updated_at, updated_at = @updated_at
       WHERE id = @id`
    )
    .run({
      id,
      currency: input.currency,
      exchange_rate: rate,
      exchange_rate_is_manual: isManual ? 1 : 0,
      exchange_rate_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  return getProjectById(id) as Project
}

export function updateProjectAiModelOverride(id: string, aiModelOverride: string | null): Project {
  getDb()
    .prepare('UPDATE projects SET ai_model_override = @ai_model_override WHERE id = @id')
    .run({ id, ai_model_override: aiModelOverride })
  return getProjectById(id) as Project
}

export function updateProjectDetails(
  id: string,
  patch: Partial<{
    name: string
    substationLabel: string
    sector: string | null
    company: string | null
    coordinator: string | null
    status: ProjectStatus
  }>
): Project {
  const fields: string[] = []
  const params: Record<string, unknown> = { id }
  if (patch.name !== undefined) {
    fields.push('name = @name')
    params.name = patch.name
  }
  if (patch.substationLabel !== undefined) {
    fields.push('substation_label = @substation_label')
    params.substation_label = patch.substationLabel
  }
  if (patch.sector !== undefined) {
    fields.push('sector = @sector')
    params.sector = patch.sector
  }
  if (patch.company !== undefined) {
    fields.push('company = @company')
    params.company = patch.company
  }
  if (patch.coordinator !== undefined) {
    fields.push('coordinator = @coordinator')
    params.coordinator = patch.coordinator
  }
  if (patch.status !== undefined) {
    fields.push('status = @status')
    params.status = patch.status
  }
  if (fields.length > 0) {
    getDb()
      .prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = @id`)
      .run(params)
  }
  return getProjectById(id) as Project
}

export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}
