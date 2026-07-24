import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { Annotation, CreateAnnotationInput } from '@shared/types/entities'

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
}

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
    createdAt: row.created_at
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
    created_at: new Date().toISOString()
  }

  getDb()
    .prepare(
      `INSERT INTO annotations (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at)
       VALUES (@id, @sld_id, @page_number, @author_type, @shape_type, @path_data, @color, @stroke_width, @comment_text, @created_at)`
    )
    .run(row)

  return toAnnotation(row)
}

export function deleteAnnotation(id: string): void {
  getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id)
}
