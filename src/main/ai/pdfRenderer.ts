import { createRequire } from 'module'
import { dirname, join } from 'path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { AnnotationBoundingBox } from '@shared/types/entities'

const require = createRequire(import.meta.url)
// pdfjs-dist ships the standard 14 fonts' glyph outlines as a separate
// data directory it needs an explicit path to in Node (no browser to
// fetch them from) — without this, text using a non-embedded standard
// font throws while rendering.
const STANDARD_FONT_DATA_URL = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/'

// Target long-edge pixel size for rendered PDF pages sent to Claude for
// extraction. Images larger than the model's effective input resolution
// get downscaled server-side regardless of what's sent, so rendering
// bigger than this spends more input tokens for no legibility gain. See
// docs/superpowers/specs/2026-08-03-vision-accuracy-page-rendering-design.md
// for the reasoning and its limits.
export const TARGET_LONG_EDGE_PX = 1568

// Target long-edge pixel size for a cropped panel region — higher than
// the whole-page target since more detail is the whole point of cropping,
// but capped so a tiny/degenerate panel box can't demand an arbitrarily
// high internal render scale. See
// docs/superpowers/specs/2026-08-05-vision-accuracy-crop-zoom-design.md.
export const MAX_CROP_LONG_EDGE_PX = 2400

// A panel box narrower or shorter than this fraction of the page is
// treated as malformed/degenerate and skipped rather than cropped.
export const MIN_CROP_BOX_FRACTION = 0.01

export function computeRenderScale(
  pageWidthPt: number,
  pageHeightPt: number,
  targetLongEdgePx: number
): number {
  const longEdgePt = Math.max(pageWidthPt, pageHeightPt)
  return targetLongEdgePx / longEdgePt
}

export function isValidPanelBox(boundingBox: AnnotationBoundingBox): boolean {
  return boundingBox.width >= MIN_CROP_BOX_FRACTION && boundingBox.height >= MIN_CROP_BOX_FRACTION
}

// The panel's pixel-space rect at a given render scale, in the same
// top-down, already-flipped image convention `boundingBox` uses
// everywhere else in this codebase (annotations, extraction schema).
export function computeCropPixelRect(
  pageWidthPt: number,
  pageHeightPt: number,
  boundingBox: AnnotationBoundingBox,
  cropScale: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: boundingBox.x * pageWidthPt * cropScale,
    y: boundingBox.y * pageHeightPt * cropScale,
    width: boundingBox.width * pageWidthPt * cropScale,
    height: boundingBox.height * pageHeightPt * cropScale
  }
}

type NodeCanvasFactory = {
  create(width: number, height: number): { canvas: unknown; context: CanvasRenderingContext2D }
}

function getCanvasFactory(pdfDoc: PDFDocumentProxy): NodeCanvasFactory {
  return pdfDoc.canvasFactory as unknown as NodeCanvasFactory
}

function canvasToBase64Png(canvas: unknown): string {
  return (canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer('image/png').toString('base64')
}

export async function loadPdfDocument(pdfBytes: Uint8Array): Promise<PDFDocumentProxy> {
  const loadingTask = getDocument({
    data: pdfBytes,
    standardFontDataUrl: STANDARD_FONT_DATA_URL
  })
  return loadingTask.promise
}

export async function renderPdfPagesToImages(
  pdfDoc: PDFDocumentProxy
): Promise<{ pageNumber: number; base64Png: string }[]> {
  const pages: { pageNumber: number; base64Png: string }[] = []
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = computeRenderScale(baseViewport.width, baseViewport.height, TARGET_LONG_EDGE_PX)
    const viewport = page.getViewport({ scale })

    // Use pdfjs-dist's own canvasFactory (its internal NodeCanvasFactory,
    // which requires @napi-rs/canvas itself) rather than creating a canvas
    // from our own separately-imported @napi-rs/canvas instance — mixing
    // the two causes an `instanceof Path2D` mismatch during text
    // rendering (ESM import vs pdfjs-dist's internal CJS require load as
    // two distinct module instances with two distinct Path2D classes).
    const canvasFactory = getCanvasFactory(pdfDoc)
    const { canvas, context } = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: context, viewport }).promise

    pages.push({ pageNumber, base64Png: canvasToBase64Png(canvas) })
  }

  return pages
}

// Crops and re-renders one panel region from the original PDF at a fresh,
// higher resolution than the whole-page render — the whole point being
// detail a whole-page image can't provide. Returns null (not an error)
// for a malformed/degenerate box; the caller decides whether that's worth
// logging.
export async function renderPdfPanelCrop(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  boundingBox: AnnotationBoundingBox
): Promise<string | null> {
  if (!isValidPanelBox(boundingBox)) return null

  const page = await pdfDoc.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const cropScale = computeRenderScale(
    boundingBox.width * baseViewport.width,
    boundingBox.height * baseViewport.height,
    MAX_CROP_LONG_EDGE_PX
  )
  const rect = computeCropPixelRect(baseViewport.width, baseViewport.height, boundingBox, cropScale)

  // pdfjs's own offsetX/offsetY (in output-pixel space, applied after
  // scale) shifts the render origin so only the panel's content lands in
  // a canvas sized to just the crop — pdfjs still walks the full page's
  // vector content internally, but only the crop-sized bitmap is ever
  // materialized. See the design doc for why this is safer than composing
  // a separate pre-viewport transform matrix by hand.
  const viewport = page.getViewport({ scale: cropScale, offsetX: -rect.x, offsetY: -rect.y })

  const canvasFactory = getCanvasFactory(pdfDoc)
  const { canvas, context } = canvasFactory.create(Math.ceil(rect.width), Math.ceil(rect.height))
  await page.render({ canvasContext: context, viewport }).promise

  return canvasToBase64Png(canvas)
}
