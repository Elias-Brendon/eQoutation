import { PDFDocument, rgb, type RGB } from 'pdf-lib'
import type { Annotation } from '@shared/types/entities'

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

// Annotation points are normalized 0-1 fractions of the page, with the
// canvas's top-left origin (y grows down) — pdf-lib's page origin is
// bottom-left (y grows up), so the y axis needs flipping.
function toPdfPoint(
  point: { x: number; y: number },
  pageWidth: number,
  pageHeight: number
): { x: number; y: number } {
  return { x: point.x * pageWidth, y: (1 - point.y) * pageHeight }
}

const PIN_RADIUS = 7

// Bakes freehand strokes and pin markers onto an export-only copy of the
// PDF — never mutates the original stored file. Returns the flattened bytes.
export async function flattenAnnotations(
  pdfBytes: Uint8Array,
  annotations: Annotation[]
): Promise<Uint8Array> {
  if (annotations.length === 0) return pdfBytes

  const doc = await PDFDocument.load(pdfBytes)
  const pages = doc.getPages()

  const byPage = new Map<number, Annotation[]>()
  for (const annotation of annotations) {
    const bucket = byPage.get(annotation.pageNumber) ?? []
    bucket.push(annotation)
    byPage.set(annotation.pageNumber, bucket)
  }

  for (const [pageNumber, pageAnnotations] of byPage) {
    const page = pages[pageNumber - 1]
    if (!page) continue
    const { width, height } = page.getSize()
    const color = (hex: string): RGB => hexToRgb(hex)

    for (const annotation of pageAnnotations) {
      if (annotation.shapeType === 'freehand') {
        for (let i = 1; i < annotation.points.length; i++) {
          const start = toPdfPoint(annotation.points[i - 1], width, height)
          const end = toPdfPoint(annotation.points[i], width, height)
          page.drawLine({ start, end, thickness: 2.5, color: color(annotation.color) })
        }
      } else if (annotation.shapeType === 'pin' && annotation.points.length > 0) {
        const center = toPdfPoint(annotation.points[0], width, height)
        page.drawEllipse({
          x: center.x,
          y: center.y,
          xScale: PIN_RADIUS,
          yScale: PIN_RADIUS,
          color: color(annotation.color),
          borderColor: rgb(1, 1, 1),
          borderWidth: 1
        })
        if (annotation.commentText) {
          page.drawText(annotation.commentText, {
            x: center.x + PIN_RADIUS + 4,
            y: center.y - 4,
            size: 9,
            color: rgb(0, 0, 0),
            maxWidth: 240
          })
        }
      }
    }
  }

  return doc.save()
}
