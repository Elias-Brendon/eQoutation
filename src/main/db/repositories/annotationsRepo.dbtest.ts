import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { createFlags } from './flagsRepo'
import {
  AI_ANNOTATION_COLOR_PALETTE,
  createAiAnnotation,
  createAiAnnotationsForFlags,
  createAiAnnotationsForLines,
  listAnnotationsBySld,
  resolveAiAnnotation,
  stackedFallbackBox
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

function createProjectSldQuotationLine(): { sldId: string; quotationId: string; lineId: string } {
  const { sldId, quotationId } = createProjectSldQuotation()
  const now = new Date().toISOString()
  const lineId = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO quotation_lines
         (id, quotation_id, catalog_item_id, page_number, tag, description, maker, qty, uom,
          list_price, discount_factor, unit_cost, total_cost, margin, quote_price, match_status, match_confidence,
          ai_confidence, panel_name, sku, component_type, created_at)
       VALUES (?, ?, NULL, 1, '', 'desc', '', 1, 'PC', 0, 1, 0, 0, 1, 0, 'matched', 1, 1, '', '', '', ?)`
    )
    .run(lineId, quotationId, now)
  return { sldId, quotationId, lineId }
}

describe('stackedFallbackBox', () => {
  it('stacks fallback anchors downward with a fixed x anchor', () => {
    const anchor0 = stackedFallbackBox(0)
    const anchor1 = stackedFallbackBox(1)
    expect(anchor0.x).toBe(0.03)
    expect(anchor0.y).toBeCloseTo(0.05)
    expect(anchor1.y).toBeCloseTo(0.11)
  })
})

describe('createAiAnnotation', () => {
  it('creates an ai-authored rectangle linked to a flag, using a palette color', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'Check this MCCB rating', pageNumber: 2 }
    ])

    const annotation = createAiAnnotation({
      sldId,
      pageNumber: 2,
      commentText: flag.message,
      linkedFlagId: flag.id,
      linkedQuotationLineId: null,
      boundingBox: { x: 0.4, y: 0.3, width: 0.1, height: 0.05 },
      colorIndex: 0
    })

    expect(annotation.authorType).toBe('ai')
    expect(annotation.shapeType).toBe('rectangle')
    expect(AI_ANNOTATION_COLOR_PALETTE).toContain(annotation.color)
    expect(annotation.linkedFlagId).toBe(flag.id)
    expect(annotation.resolvedAt).toBeNull()
    expect(annotation.points).toEqual([
      { x: 0.4, y: 0.3 },
      { x: 0.5, y: 0.35 }
    ])
  })

  it('falls back to a small fixed-size box at the given anchor when boundingBox is null', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [{ origin: 'ai', message: 'no box', pageNumber: 1 }])

    const annotation = createAiAnnotation({
      sldId,
      pageNumber: 1,
      commentText: flag.message,
      linkedFlagId: flag.id,
      linkedQuotationLineId: null,
      boundingBox: null,
      fallbackIndexOnPage: 0,
      colorIndex: 0
    })

    expect(annotation.points).toHaveLength(2)
    expect(annotation.points[0]).toEqual(stackedFallbackBox(0))
  })
})

describe('createAiAnnotationsForFlags', () => {
  it("creates annotations only for ai-origin flags, using each flag's paired bounding box", () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [
      { origin: 'ai', message: 'AI flag with box', pageNumber: 1 },
      { origin: 'ai', message: 'AI flag without box', pageNumber: 1 },
      { origin: 'matcher', message: 'Unmatched item', pageNumber: 1 }
    ])
    const boundingBoxes = [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, null, null]

    createAiAnnotationsForFlags(sldId, flags, boundingBoxes)

    const annotations = listAnnotationsBySld(sldId)
    expect(annotations).toHaveLength(2)
    expect(annotations.every((a) => a.authorType === 'ai' && a.shapeType === 'rectangle')).toBe(
      true
    )
    const withBox = annotations.find((a) => a.linkedFlagId === flags[0].id)
    expect(withBox?.points[0]).toEqual({ x: 0.2, y: 0.2 })
    const withoutBox = annotations.find((a) => a.linkedFlagId === flags[1].id)
    expect(withoutBox?.points[0]).toEqual(stackedFallbackBox(0))
  })

  it('skips ai flags with no page number', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [{ origin: 'ai', message: 'No page', pageNumber: null }])

    createAiAnnotationsForFlags(sldId, flags, [null])

    expect(listAnnotationsBySld(sldId)).toHaveLength(0)
  })

  it('cycles through the color palette so consecutive annotations differ', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [
      { origin: 'ai', message: 'a', pageNumber: 1 },
      { origin: 'ai', message: 'b', pageNumber: 1 },
      { origin: 'ai', message: 'c', pageNumber: 1 }
    ])

    createAiAnnotationsForFlags(sldId, flags, [null, null, null])

    const annotations = listAnnotationsBySld(sldId)
    const colors = annotations.map((a) => a.color)
    expect(colors[0]).not.toBe(colors[1])
    expect(colors[1]).not.toBe(colors[2])
  })
})

describe('createAiAnnotationsForLines', () => {
  it('creates one annotation per line, using the flag message when one is linked', () => {
    const { sldId, quotationId, lineId } = createProjectSldQuotationLine()
    const [flag] = createFlags(quotationId, [
      {
        origin: 'ai',
        message: 'Low-confidence extraction: "X"',
        pageNumber: 1,
        quotationLineId: lineId
      }
    ])

    createAiAnnotationsForLines(sldId, [
      {
        lineId,
        pageNumber: 1,
        boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
        commentText: flag.message,
        linkedFlagId: flag.id
      }
    ])

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.linkedQuotationLineId).toBe(lineId)
    expect(annotation.linkedFlagId).toBe(flag.id)
    expect(annotation.commentText).toBe(flag.message)
  })

  it('creates an unflagged annotation with no linked_flag_id for a plain line', () => {
    const { sldId, lineId } = createProjectSldQuotationLine()

    createAiAnnotationsForLines(sldId, [
      {
        lineId,
        pageNumber: 1,
        boundingBox: null,
        commentText: 'Some MCB — 1 nos, AI confidence 92%',
        linkedFlagId: null
      }
    ])

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.linkedQuotationLineId).toBe(lineId)
    expect(annotation.linkedFlagId).toBeNull()
    expect(annotation.resolvedAt).toBeNull()
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
      linkedQuotationLineId: null,
      boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      colorIndex: 0
    })

    resolveAiAnnotation(flag.id)

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.resolvedAt).not.toBeNull()
  })

  it('is a no-op when no annotation is linked to the flag', () => {
    expect(() => resolveAiAnnotation('nonexistent-flag-id')).not.toThrow()
  })
})
