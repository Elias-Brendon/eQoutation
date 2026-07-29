import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import {
  assertCanExtract,
  completeExtraction,
  createRunningExtraction,
  failExtraction,
  getProjectTokenUsage
} from './extractionsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

function createProjectWithSld(): { projectId: string; sldId: string } {
  const db = getDb()
  const now = new Date().toISOString()
  const projectId = randomUUID()
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    'Test Project',
    now,
    now
  )
  const sldId = randomUUID()
  db.prepare(
    'INSERT INTO slds (id, project_id, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sldId, projectId, 'test.pdf', now, now)
  return { projectId, sldId }
}

describe('completeExtraction / failExtraction usage persistence', () => {
  it('persists token usage on a completed extraction', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)

    completeExtraction(
      extraction.id,
      'claude-sonnet-5',
      { components: [], flags: [] },
      { inputTokens: 1000, outputTokens: 250 }
    )

    const row = getDb().prepare('SELECT input_tokens, output_tokens FROM extractions WHERE id = ?').get(
      extraction.id
    ) as { input_tokens: number; output_tokens: number }
    expect(row.input_tokens).toBe(1000)
    expect(row.output_tokens).toBe(250)
  })

  it('persists token usage on a failed extraction that still got an API response', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)

    failExtraction(extraction.id, 'Error AI-005: Response too large, cut off', {
      inputTokens: 800,
      outputTokens: 64000
    })

    const row = getDb().prepare('SELECT input_tokens, output_tokens FROM extractions WHERE id = ?').get(
      extraction.id
    ) as { input_tokens: number | null; output_tokens: number | null }
    expect(row.input_tokens).toBe(800)
    expect(row.output_tokens).toBe(64000)
  })

  it('leaves token columns null when no API response was ever received', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)

    failExtraction(extraction.id, 'Error AI-001: Anthropic API key not set', null)

    const row = getDb().prepare('SELECT input_tokens, output_tokens FROM extractions WHERE id = ?').get(
      extraction.id
    ) as { input_tokens: number | null; output_tokens: number | null }
    expect(row.input_tokens).toBeNull()
    expect(row.output_tokens).toBeNull()
  })
})

describe('getProjectTokenUsage', () => {
  it('sums tokens across multiple extractions for the project, excluding other projects', () => {
    const { projectId, sldId } = createProjectWithSld()
    const other = createProjectWithSld()

    const e1 = createRunningExtraction(sldId)
    completeExtraction(e1.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 1000,
      outputTokens: 200
    })
    const e2 = createRunningExtraction(sldId)
    failExtraction(e2.id, 'Error AI-005: Response too large, cut off', {
      inputTokens: 500,
      outputTokens: 64000
    })
    const eOther = createRunningExtraction(other.sldId)
    completeExtraction(eOther.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 9999,
      outputTokens: 9999
    })

    const usage = getProjectTokenUsage(projectId)
    expect(usage.totalInputTokens).toBe(1500)
    expect(usage.totalOutputTokens).toBe(64200)
    expect(usage.extractionCount).toBe(2)
  })

  it('excludes extractions belonging to a soft-deleted SLD', () => {
    const { projectId, sldId } = createProjectWithSld()
    const e1 = createRunningExtraction(sldId)
    completeExtraction(e1.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 100,
      outputTokens: 100
    })
    getDb()
      .prepare('UPDATE slds SET deleted_at = ? WHERE id = ?')
      .run(new Date().toISOString(), sldId)

    const usage = getProjectTokenUsage(projectId)
    expect(usage.totalInputTokens).toBe(0)
    expect(usage.totalOutputTokens).toBe(0)
    expect(usage.extractionCount).toBe(0)
  })

  it('returns zeroes for a project with no extractions', () => {
    const { projectId } = createProjectWithSld()
    const usage = getProjectTokenUsage(projectId)
    expect(usage).toEqual({ totalInputTokens: 0, totalOutputTokens: 0, extractionCount: 0 })
  })
})

describe('assertCanExtract', () => {
  it('does not throw when the SLD has never been extracted', () => {
    const { sldId } = createProjectWithSld()
    expect(() => assertCanExtract(sldId, false)).not.toThrow()
  })

  it('does not throw when the latest extraction errored', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)
    failExtraction(extraction.id, 'Error AI-007: Extraction failed', null)
    expect(() => assertCanExtract(sldId, false)).not.toThrow()
  })

  it('throws AI_ALREADY_EXTRACTED when the latest extraction succeeded and force is not set', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)
    completeExtraction(extraction.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 100,
      outputTokens: 100
    })
    expect(() => assertCanExtract(sldId, false)).toThrow('Error AI-009')
  })

  it('does not throw when the latest extraction succeeded but force is true', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)
    completeExtraction(extraction.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 100,
      outputTokens: 100
    })
    expect(() => assertCanExtract(sldId, true)).not.toThrow()
  })
})
