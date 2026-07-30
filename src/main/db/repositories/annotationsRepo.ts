import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  Annotation,
  AnnotationBoundingBox,
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
  linked_quotation_line_id: string | null
  resolved_at: string | null
}

export const AI_ANNOTATION_COLOR_PALETTE = [
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
  '#a855f7'
] as const
const AI_BOX_ANCHOR_X = 0.03
const AI_BOX_BASE_Y = 0.05
const AI_BOX_STACK_STEP_Y = 0.06
const AI_BOX_FALLBACK_WIDTH = 0.1
const AI_BOX_FALLBACK_HEIGHT = 0.04

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
    linkedQuotationLineId: row.linked_quotation_line_id,
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
    linked_quotation_line_id: null,
    resolved_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO annotations (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at, linked_flag_id, linked_quotation_line_id, resolved_at)
       VALUES (@id, @sld_id, @page_number, @author_type, @shape_type, @path_data, @color, @stroke_width, @comment_text, @created_at, @linked_flag_id, @linked_quotation_line_id, @resolved_at)`
    )
    .run(row)

  return toAnnotation(row)
}

export function deleteAnnotation(id: string): void {
  getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id)
}

// Fixed anchor, stacked per page — used only when the model didn't supply a
// boundingBox for this flag. Returns the box's top-left corner plus a small
// fixed size, since a rectangle needs two corners, not just a point.
export function stackedFallbackBox(indexOnPage: number): AnnotationPoint {
  return { x: AI_BOX_ANCHOR_X, y: AI_BOX_BASE_Y + AI_BOX_STACK_STEP_Y * indexOnPage }
}

function boxToCorners(box: AnnotationBoundingBox): [AnnotationPoint, AnnotationPoint] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y + box.height }
  ]
}

export interface CreateAiAnnotationInput {
  sldId: string
  pageNumber: number
  commentText: string
  linkedFlagId: string | null
  linkedQuotationLineId: string | null
  boundingBox: AnnotationBoundingBox | null
  /** Only used when boundingBox is null, to stack the fallback box. Defaults to 0. */
  fallbackIndexOnPage?: number
  /** Cycles through AI_ANNOTATION_COLOR_PALETTE so nearby boxes are visually distinct. */
  colorIndex: number
}

export function createAiAnnotation(input: CreateAiAnnotationInput): Annotation {
  const corners = input.boundingBox
    ? boxToCorners(input.boundingBox)
    : (() => {
        const anchor = stackedFallbackBox(input.fallbackIndexOnPage ?? 0)
        return [
          anchor,
          { x: anchor.x + AI_BOX_FALLBACK_WIDTH, y: anchor.y + AI_BOX_FALLBACK_HEIGHT }
        ] as [AnnotationPoint, AnnotationPoint]
      })()

  const row: AnnotationRow = {
    id: randomUUID(),
    sld_id: input.sldId,
    page_number: input.pageNumber,
    author_type: 'ai',
    shape_type: 'rectangle',
    path_data: JSON.stringify(corners),
    color: AI_ANNOTATION_COLOR_PALETTE[input.colorIndex % AI_ANNOTATION_COLOR_PALETTE.length],
    stroke_width: 2,
    comment_text: input.commentText,
    created_at: new Date().toISOString(),
    linked_flag_id: input.linkedFlagId,
    linked_quotation_line_id: input.linkedQuotationLineId,
    resolved_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO annotations (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at, linked_flag_id, linked_quotation_line_id, resolved_at)
       VALUES (@id, @sld_id, @page_number, @author_type, @shape_type, @path_data, @color, @stroke_width, @comment_text, @created_at, @linked_flag_id, @linked_quotation_line_id, @resolved_at)`
    )
    .run(row)

  return toAnnotation(row)
}

// Called right after quotation generation creates its batch of flags.
// `boundingBoxes[i]` must correspond to `flags[i]` — see quotations.ipc.ts,
// which builds both arrays in lockstep. Only origin:'ai' flags with a page
// number get an annotation; matcher/human flags and page-less ai flags are
// silently skipped (see design spec's non-goals). Best-effort per flag: one
// failed insert must not block the rest.
export function createAiAnnotationsForFlags(
  sldId: string,
  flags: Flag[],
  boundingBoxes: (AnnotationBoundingBox | null)[]
): void {
  const fallbackCountByPage = new Map<number, number>()
  let colorIndex = 0
  flags.forEach((flag, i) => {
    if (flag.origin !== 'ai' || flag.pageNumber === null) return
    const boundingBox = boundingBoxes[i] ?? null
    let fallbackIndexOnPage: number | undefined
    if (!boundingBox) {
      fallbackIndexOnPage = fallbackCountByPage.get(flag.pageNumber) ?? 0
      fallbackCountByPage.set(flag.pageNumber, fallbackIndexOnPage + 1)
    }
    try {
      createAiAnnotation({
        sldId,
        pageNumber: flag.pageNumber,
        commentText: flag.message,
        linkedFlagId: flag.id,
        linkedQuotationLineId: null,
        boundingBox,
        fallbackIndexOnPage,
        colorIndex: colorIndex++
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for flag', flag.id, err)
    }
  })
}

export interface LineAnnotationInput {
  lineId: string
  pageNumber: number
  boundingBox: AnnotationBoundingBox | null
  commentText: string
  linkedFlagId: string | null
}

// Called right after quotation generation, once per quotation line — every
// extracted component gets exactly one annotation (unlike
// createAiAnnotationsForFlags, which only covers flagged items). A line that
// also has an AI flag gets that flag's message and linked_flag_id (so
// resolving it still dims the box); otherwise the box is a plain, permanent
// record of what the AI extracted there.
export function createAiAnnotationsForLines(sldId: string, inputs: LineAnnotationInput[]): void {
  const fallbackCountByPage = new Map<number, number>()
  let colorIndex = 0
  for (const input of inputs) {
    let fallbackIndexOnPage: number | undefined
    if (!input.boundingBox) {
      fallbackIndexOnPage = fallbackCountByPage.get(input.pageNumber) ?? 0
      fallbackCountByPage.set(input.pageNumber, fallbackIndexOnPage + 1)
    }
    try {
      createAiAnnotation({
        sldId,
        pageNumber: input.pageNumber,
        commentText: input.commentText,
        linkedFlagId: input.linkedFlagId,
        linkedQuotationLineId: input.lineId,
        boundingBox: input.boundingBox,
        fallbackIndexOnPage,
        colorIndex: colorIndex++
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for line', input.lineId, err)
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
