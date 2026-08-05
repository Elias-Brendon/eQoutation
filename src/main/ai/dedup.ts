import type { AnnotationBoundingBox, ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

// A candidate is considered a likely duplicate when its bounding box
// overlaps an existing item's above this IoU, OR (if overlap is below
// that) their centers are close enough in normalized page coordinates.
export const DEDUP_IOU_THRESHOLD = 0.3
export const DEDUP_CENTER_DISTANCE = 0.05

function boxArea(box: AnnotationBoundingBox): number {
  return box.width * box.height
}

function boxIntersectionArea(a: AnnotationBoundingBox, b: AnnotationBoundingBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const width = Math.max(0, x2 - x1)
  const height = Math.max(0, y2 - y1)
  return width * height
}

function boxIoU(a: AnnotationBoundingBox, b: AnnotationBoundingBox): number {
  const intersection = boxIntersectionArea(a, b)
  if (intersection <= 0) return 0
  const union = boxArea(a) + boxArea(b) - intersection
  return union > 0 ? intersection / union : 0
}

function boxCenterDistance(a: AnnotationBoundingBox, b: AnnotationBoundingBox): number {
  const centerAx = a.x + a.width / 2
  const centerAy = a.y + a.height / 2
  const centerBx = b.x + b.width / 2
  const centerBy = b.y + b.height / 2
  return Math.hypot(centerAx - centerBx, centerAy - centerBy)
}

// A missing box on either side (a valid, common case — see
// extractionSchema.ts's validateBoundingBox) is neutral, not a mismatch:
// it must not rule a candidate OUT on its own. The page + text-similarity
// check in dedupeComponents/dedupeFlags carries the decision instead.
export function boundingBoxesLikelyMatch(
  a: AnnotationBoundingBox | null,
  b: AnnotationBoundingBox | null
): boolean {
  if (!a || !b) return true
  if (boxIoU(a, b) >= DEDUP_IOU_THRESHOLD) return true
  return boxCenterDistance(a, b) <= DEDUP_CENTER_DISTANCE
}

function normalizedText(value: string): string {
  return value.trim().toLowerCase()
}

function isLikelyDuplicateComponent(existing: ExtractedComponent, candidate: ExtractedComponent): boolean {
  if (existing.pageNumber !== candidate.pageNumber) return false
  if (!boundingBoxesLikelyMatch(existing.boundingBox, candidate.boundingBox)) return false
  if (existing.tag && candidate.tag) {
    return normalizedText(existing.tag) === normalizedText(candidate.tag)
  }
  return normalizedText(existing.description) === normalizedText(candidate.description)
}

export function dedupeComponents(
  existing: ExtractedComponent[],
  candidates: ExtractedComponent[]
): ExtractedComponent[] {
  return candidates.filter(
    (candidate) => !existing.some((item) => isLikelyDuplicateComponent(item, candidate))
  )
}

function isLikelyDuplicateFlag(existing: ExtractionFlag, candidate: ExtractionFlag): boolean {
  if (existing.pageNumber !== candidate.pageNumber) return false
  if (!boundingBoxesLikelyMatch(existing.boundingBox, candidate.boundingBox)) return false
  return normalizedText(existing.message) === normalizedText(candidate.message)
}

export function dedupeFlags(existing: ExtractionFlag[], candidates: ExtractionFlag[]): ExtractionFlag[] {
  return candidates.filter(
    (candidate) => !existing.some((item) => isLikelyDuplicateFlag(item, candidate))
  )
}
