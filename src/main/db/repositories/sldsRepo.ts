import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { Sld } from '@shared/types/entities'

interface SldRow {
  id: string
  project_id: string
  filename: string
  file_path: string
  section_group: string
  status: Sld['status']
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function toSld(row: SldRow): Sld {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    filePath: row.file_path,
    sectionGroup: row.section_group,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listSldsByProject(projectId: string): Sld[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM slds WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    )
    .all(projectId) as SldRow[]
  return rows.map(toSld)
}

export function getSldById(id: string): Sld | null {
  const row = getDb().prepare('SELECT * FROM slds WHERE id = ? AND deleted_at IS NULL').get(id) as
    SldRow | undefined
  return row ? toSld(row) : null
}

interface InsertSldInput {
  projectId: string
  filename: string
  filePath: string
  sectionGroup?: string
}

export function insertSld(input: InsertSldInput): Sld {
  const now = new Date().toISOString()
  const row: SldRow = {
    id: randomUUID(),
    project_id: input.projectId,
    filename: input.filename,
    file_path: input.filePath,
    section_group: input.sectionGroup ?? '',
    status: 'in_progress',
    created_at: now,
    updated_at: now,
    deleted_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO slds (id, project_id, filename, file_path, section_group, status, created_at, updated_at, deleted_at)
       VALUES (@id, @project_id, @filename, @file_path, @section_group, @status, @created_at, @updated_at, @deleted_at)`
    )
    .run(row)

  return toSld(row)
}

export function updateSldStatus(id: string, status: Sld['status']): void {
  getDb()
    .prepare('UPDATE slds SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id)
}

export function softDeleteSld(id: string): void {
  getDb()
    .prepare('UPDATE slds SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), new Date().toISOString(), id)
}
