import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { CreateProjectInput, Project, UpdateProjectCurrencySettingsInput } from '@shared/types/entities'

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
    updatedAt: row.updated_at
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

export function createProject(input: CreateProjectInput): Project {
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
    updated_at: now
  }

  getDb()
    .prepare(
      `INSERT INTO projects
         (id, name, substation_label, currency, exchange_rate, exchange_rate_is_manual,
          exchange_rate_updated_at, ai_progress_pct, created_at, updated_at)
       VALUES
         (@id, @name, @substation_label, @currency, @exchange_rate, @exchange_rate_is_manual,
          @exchange_rate_updated_at, @ai_progress_pct, @created_at, @updated_at)`
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
