import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectDetails
} from './projectsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('projectsRepo aiModelOverride', () => {
  it('defaults a new project to no override', () => {
    const project = createProject({ name: 'Test Project' })
    expect(project.aiModelOverride).toBeNull()
  })

  it('sets an override and reflects it via getProjectById and listProjects', () => {
    const project = createProject({ name: 'Test Project' })

    const updated = updateProjectAiModelOverride(project.id, 'claude-opus-4-8')
    expect(updated.aiModelOverride).toBe('claude-opus-4-8')

    const fetched = getProjectById(project.id)
    expect(fetched?.aiModelOverride).toBe('claude-opus-4-8')

    const listed = listProjects().find((p) => p.id === project.id)
    expect(listed?.aiModelOverride).toBe('claude-opus-4-8')
  })

  it('clears an override back to null', () => {
    const project = createProject({ name: 'Test Project' })
    updateProjectAiModelOverride(project.id, 'claude-opus-4-8')

    const cleared = updateProjectAiModelOverride(project.id, null)
    expect(cleared.aiModelOverride).toBeNull()
  })
})

describe('projectsRepo project details', () => {
  it('assigns sequential quotation numbers starting at PRJ-0001', () => {
    const first = createProject({ name: 'First' })
    const second = createProject({ name: 'Second' })
    expect(first.quotationNumber).toBe('PRJ-0001')
    expect(second.quotationNumber).toBe('PRJ-0002')
  })

  it('defaults status to pending_review and sector/company/coordinator to null when not provided', () => {
    const project = createProject({ name: 'Test Project' })
    expect(project.status).toBe('pending_review')
    expect(project.sector).toBeNull()
    expect(project.company).toBeNull()
    expect(project.coordinator).toBeNull()
  })

  it('stores sector, company, and coordinator when provided at creation', () => {
    const project = createProject({
      name: 'Test Project',
      sector: 'Data Centre',
      company: 'Acme Corp',
      coordinator: 'elias'
    })
    expect(project.sector).toBe('Data Centre')
    expect(project.company).toBe('Acme Corp')
    expect(project.coordinator).toBe('elias')
  })

  it('sets createdBy from the value passed in and never changes it via updateProjectDetails', () => {
    const project = createProject({ name: 'Test Project' }, 'elias')
    expect(project.createdBy).toBe('elias')

    const updated = updateProjectDetails(project.id, { name: 'Renamed' })
    expect(updated.createdBy).toBe('elias')
  })

  it('updates only the fields present in the patch, leaving others untouched', () => {
    const project = createProject({ name: 'Test Project', sector: 'Industrial' })

    const updated = updateProjectDetails(project.id, { company: 'Acme Corp' })
    expect(updated.company).toBe('Acme Corp')
    expect(updated.sector).toBe('Industrial')
    expect(updated.name).toBe('Test Project')
  })

  it('updates status', () => {
    const project = createProject({ name: 'Test Project' })
    const updated = updateProjectDetails(project.id, { status: 'approved' })
    expect(updated.status).toBe('approved')
  })
})

describe('deleteProject', () => {
  it('cascades: deleting a project removes its slds, quotations, and quotation lines', () => {
    const project = createProject({ name: 'To Delete' })
    const db = getDb()
    const now = new Date().toISOString()

    const sldId = randomUUID()
    db.prepare(
      'INSERT INTO slds (id, project_id, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(sldId, project.id, 'test.pdf', now, now)

    const quotationId = randomUUID()
    db.prepare(
      "INSERT INTO quotations (id, sld_id, code, created_at, updated_at) VALUES (?, ?, 'Q-TEST', ?, ?)"
    ).run(quotationId, sldId, now, now)

    const lineId = randomUUID()
    db.prepare(
      `INSERT INTO quotation_lines
         (id, quotation_id, catalog_item_id, description, match_status, match_confidence, created_at)
       VALUES (?, ?, NULL, 'Test Line', 'matched', 1, ?)`
    ).run(lineId, quotationId, now)

    deleteProject(project.id)

    expect(getProjectById(project.id)).toBeNull()
    expect(db.prepare('SELECT * FROM slds WHERE id = ?').get(sldId)).toBeUndefined()
    expect(db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId)).toBeUndefined()
    expect(db.prepare('SELECT * FROM quotation_lines WHERE id = ?').get(lineId)).toBeUndefined()
  })

  it('is a no-op for a nonexistent project id (no throw)', () => {
    expect(() => deleteProject(randomUUID())).not.toThrow()
  })
})
