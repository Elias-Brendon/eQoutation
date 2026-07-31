import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../index'
import {
  createProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride
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
