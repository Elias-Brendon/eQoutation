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
