import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { createFlags } from './flagsRepo'
import {
  createAiAnnotation,
  createAiAnnotationsForFlags,
  listAnnotationsBySld,
  resolveAiAnnotation,
  stackedPinPosition
} from './annotationsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

function createProjectSldQuotation(): { sldId: string; quotationId: string } {
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
  const quotationId = randomUUID()
  db.prepare(
    `INSERT INTO quotations (id, sld_id, extraction_id, code, status, excel_file_path, created_at, updated_at)
     VALUES (?, ?, NULL, 'Q-TEST', 'pending_review', NULL, ?, ?)`
  ).run(quotationId, sldId, now, now)
  return { sldId, quotationId }
}

describe('stackedPinPosition', () => {
  it('stacks pins downward with a fixed x anchor', () => {
    expect(stackedPinPosition(0).x).toBe(0.03)
    expect(stackedPinPosition(0).y).toBeCloseTo(0.05)
    expect(stackedPinPosition(1).y).toBeCloseTo(0.11)
    expect(stackedPinPosition(2).y).toBeCloseTo(0.17)
  })
})

describe('createAiAnnotation', () => {
  it('creates an ai-authored pin linked to a flag', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'Check this MCCB rating', pageNumber: 2 }
    ])

    const annotation = createAiAnnotation({
      sldId,
      pageNumber: 2,
      commentText: flag.message,
      linkedFlagId: flag.id,
      points: [stackedPinPosition(0)]
    })

    expect(annotation.authorType).toBe('ai')
    expect(annotation.shapeType).toBe('pin')
    expect(annotation.linkedFlagId).toBe(flag.id)
    expect(annotation.resolvedAt).toBeNull()
    expect(annotation.commentText).toBe('Check this MCCB rating')
  })
})

describe('createAiAnnotationsForFlags', () => {
  it('creates annotations only for ai-origin flags, stacked per page', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [
      { origin: 'ai', message: 'AI flag page 1 (a)', pageNumber: 1 },
      { origin: 'ai', message: 'AI flag page 1 (b)', pageNumber: 1 },
      { origin: 'ai', message: 'AI flag page 2', pageNumber: 2 },
      { origin: 'matcher', message: 'Unmatched item', pageNumber: 1 }
    ])

    createAiAnnotationsForFlags(sldId, flags)

    const annotations = listAnnotationsBySld(sldId)
    expect(annotations).toHaveLength(3)
    expect(annotations.every((a) => a.authorType === 'ai')).toBe(true)

    const page1 = annotations
      .filter((a) => a.pageNumber === 1)
      .sort((a, b) => a.points[0].y - b.points[0].y)
    expect(page1[0].points[0]).toEqual(stackedPinPosition(0))
    expect(page1[1].points[0]).toEqual(stackedPinPosition(1))
  })

  it('skips ai flags with no page number', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [{ origin: 'ai', message: 'No page', pageNumber: null }])

    createAiAnnotationsForFlags(sldId, flags)

    expect(listAnnotationsBySld(sldId)).toHaveLength(0)
  })
})

describe('resolveAiAnnotation', () => {
  it('sets resolved_at on the annotation linked to a flag', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [{ origin: 'ai', message: 'msg', pageNumber: 1 }])
    createAiAnnotation({
      sldId,
      pageNumber: 1,
      commentText: flag.message,
      linkedFlagId: flag.id,
      points: [stackedPinPosition(0)]
    })

    resolveAiAnnotation(flag.id)

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.resolvedAt).not.toBeNull()
  })

  it('is a no-op when no annotation is linked to the flag', () => {
    expect(() => resolveAiAnnotation('nonexistent-flag-id')).not.toThrow()
  })
})
