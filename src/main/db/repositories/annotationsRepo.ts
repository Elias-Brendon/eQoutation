import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  Annotation,
  AnnotationPoint,
  CreateAnnotationInput,
  Flag
} from '@shared/types/entities'

interface AnnotationRow {
  id: string
  sld_id: string
  page_number: number
  author_type: Annotation['authorType']
  shape_type: Annotation['shapeType']
  path_data: string
  color: string
  stroke_width: number
  comment_text: string | null
  created_at: string
  linked_flag_id: string | null
  resolved_at: string | null
}

const AI_ANNOTATION_COLOR = '#a855f7'
const AI_PIN_ANCHOR_X = 0.03
const AI_PIN_BASE_Y = 0.05
const AI_PIN_STACK_STEP_Y = 0.06

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    sldId: row.sld_id,
    pageNumber: row.page_number,
    authorType: row.author_type,
    shapeType: row.shape_type,
    points: JSON.parse(row.path_data),
    color: row.color,
    strokeWidth: row.stroke_width,
    commentText: row.comment_text,
    createdAt: row.created_at,
    linkedFlagId: row.linked_flag_id,
    resolvedAt: row.resolved_at
  }
}

export function listAnnotationsBySldAndPage(sldId: string, pageNumber: number): Annotation[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM annotations WHERE sld_id = ? AND page_number = ? ORDER BY created_at ASC'
    )
    .all(sldId, pageNumber) as AnnotationRow[]
  return rows.map(toAnnotation)
}

export function listAnnotationsBySld(sldId: string): Annotation[] {
  const rows = getDb()
    .prepare('SELECT * FROM annotations WHERE sld_id = ? ORDER BY page_number ASC, created_at ASC')
    .all(sldId) as AnnotationRow[]
  return rows.map(toAnnotation)
}

export function insertAnnotation(input: CreateAnnotationInput): Annotation {
  const row: AnnotationRow = {
    id: randomUUID(),
    sld_id: input.sldId,
    page_number: input.pageNumber,
    author_type: 'human',
    shape_type: input.shapeType,
    path_data: JSON.stringify(input.points),
    color: input.color,
    stroke_width: input.strokeWidth ?? 2.5,
    comment_text: input.commentText ?? null,
    created_at: new Date().toISOString(),
    linked_flag_id: null,
    resolved_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO annotations (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at, linked_flag_id, resolved_at)
       VALUES (@id, @sld_id, @page_number, @author_type, @shape_type, @path_data, @color, @stroke_width, @comment_text, @created_at, @linked_flag_id, @resolved_at)`
    )
    .run(row)

  return toAnnotation(row)
}

export function deleteAnnotation(id: string): void {
  getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id)
}

// Fixed anchor, stacked per page — the AI has no spatial/region data to place
// a pin precisely, only a page number (see design spec's positioning
// non-goal). Multiple AI flags on the same page stack downward from here.
export function stackedPinPosition(indexOnPage: number): AnnotationPoint {
  return { x: AI_PIN_ANCHOR_X, y: AI_PIN_BASE_Y + AI_PIN_STACK_STEP_Y * indexOnPage }
}

export interface CreateAiAnnotationInput {
  sldId: string
  pageNumber: number
  commentText: string
  linkedFlagId: string
  points: AnnotationPoint[]
}

export function createAiAnnotation(input: CreateAiAnnotationInput): Annotation {
  const row: AnnotationRow = {
    id: randomUUID(),
    sld_id: input.sldId,
    page_number: input.pageNumber,
    author_type: 'ai',
    shape_type: 'pin',
    path_data: JSON.stringify(input.points),
    color: AI_ANNOTATION_COLOR,
    stroke_width: 2.5,
    comment_text: input.commentText,
    created_at: new Date().toISOString(),
    linked_flag_id: input.linkedFlagId,
    resolved_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO annotations (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at, linked_flag_id, resolved_at)
       VALUES (@id, @sld_id, @page_number, @author_type, @shape_type, @path_data, @color, @stroke_width, @comment_text, @created_at, @linked_flag_id, @resolved_at)`
    )
    .run(row)

  return toAnnotation(row)
}

// Called right after quotation generation creates its batch of flags. Only
// origin:'ai' flags with a page number get a pin — matcher/human flags and
// page-less ai flags are silently skipped (see design spec's non-goals).
// Best-effort per flag: one failed insert must not block the rest, since
// this runs inside the larger quotation-generation flow.
export function createAiAnnotationsForFlags(sldId: string, flags: Flag[]): void {
  const countByPage = new Map<number, number>()
  for (const flag of flags) {
    if (flag.origin !== 'ai' || flag.pageNumber === null) continue
    const indexOnPage = countByPage.get(flag.pageNumber) ?? 0
    countByPage.set(flag.pageNumber, indexOnPage + 1)
    try {
      createAiAnnotation({
        sldId,
        pageNumber: flag.pageNumber,
        commentText: flag.message,
        linkedFlagId: flag.id,
        points: [stackedPinPosition(indexOnPage)]
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for flag', flag.id, err)
    }
  }
}

// Marks the pin resolved rather than deleting it — the point is a permanent
// record of what the AI flagged and that a human addressed it, for later
// training-data use. No-op if the flag has no linked annotation (predates
// this feature, or isn't ai-origin).
export function resolveAiAnnotation(flagId: string): void {
  getDb()
    .prepare('UPDATE annotations SET resolved_at = ? WHERE linked_flag_id = ?')
    .run(new Date().toISOString(), flagId)
}
