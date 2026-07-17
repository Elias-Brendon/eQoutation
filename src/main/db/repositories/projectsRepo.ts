import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { CreateProjectInput, Project } from '@shared/types/entities'

interface ProjectRow {
  id: string
  name: string
  substation_label: string
  ai_progress_pct: number
  created_at: string
  updated_at: string
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    substationLabel: row.substation_label,
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

export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString()
  const row: ProjectRow = {
    id: randomUUID(),
    name: input.name,
    substation_label: input.substationLabel ?? '',
    ai_progress_pct: 0,
    created_at: now,
    updated_at: now
  }

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, substation_label, ai_progress_pct, created_at, updated_at)
       VALUES (@id, @name, @substation_label, @ai_progress_pct, @created_at, @updated_at)`
    )
    .run(row)

  return toProject(row)
}
