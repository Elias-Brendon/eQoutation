import { createRequire } from 'module'
import { dirname, join } from 'path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

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

export function computeRenderScale(
  pageWidthPt: number,
  pageHeightPt: number,
  targetLongEdgePx: number
): number {
  const longEdgePt = Math.max(pageWidthPt, pageHeightPt)
  return targetLongEdgePx / longEdgePt
}

export async function renderPdfPagesToImages(
  pdfBytes: Uint8Array
): Promise<{ pageNumber: number; base64Png: string }[]> {
  const loadingTask = getDocument({
    data: pdfBytes,
    standardFontDataUrl: STANDARD_FONT_DATA_URL
  })
  const pdfDoc = await loadingTask.promise

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
    const canvasFactory = pdfDoc.canvasFactory as unknown as {
      create(width: number, height: number): { canvas: unknown; context: CanvasRenderingContext2D }
    }
    const { canvas, context } = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: context, viewport }).promise

    pages.push({
      pageNumber,
      base64Png: (canvas as unknown as { toBuffer(mime: string): Buffer })
        .toBuffer('image/png')
        .toString('base64')
    })
  }

  await pdfDoc.destroy()
  return pages
}
