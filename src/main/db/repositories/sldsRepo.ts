import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { CreateSldInput, Sld } from '@shared/types/entities'

interface SldRow {
  id: string
  project_id: string
  filename: string
  section_group: string
  status: Sld['status']
  created_at: string
  updated_at: string
}

function toSld(row: SldRow): Sld {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    sectionGroup: row.section_group,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listSldsByProject(projectId: string): Sld[] {
  const rows = getDb()
    .prepare('SELECT * FROM slds WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as SldRow[]
  return rows.map(toSld)
}

export function createSld(input: CreateSldInput): Sld {
  const now = new Date().toISOString()
  const row: SldRow = {
    id: randomUUID(),
    project_id: input.projectId,
    filename: input.filename,
    section_group: input.sectionGroup ?? '',
    status: 'in_progress',
    created_at: now,
    updated_at: now
  }

  getDb()
    .prepare(
      `INSERT INTO slds (id, project_id, filename, section_group, status, created_at, updated_at)
       VALUES (@id, @project_id, @filename, @section_group, @status, @created_at, @updated_at)`
    )
    .run(row)

  return toSld(row)
}
