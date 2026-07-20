import type { CatalogItem, ExtractedComponent } from '@shared/types/entities'

// Below this, a normalized-text match is too weak to trust automatically —
// the line is left unmatched for a human to resolve (Stage 9).
const MATCH_THRESHOLD = 0.3

export interface MatchResult {
  catalogItem: CatalogItem | null
  confidence: number
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(text: string): Set<string> {
  const normalized = normalize(text)
  return new Set(normalized.length ? normalized.split(' ') : [])
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const token of a) {
    if (b.has(token)) overlap++
  }
  return overlap / (a.size + b.size - overlap)
}

export function matchComponent(
  component: ExtractedComponent,
  catalogItems: CatalogItem[]
): MatchResult {
  const tag = component.tag.trim().toLowerCase()
  if (tag) {
    const exact = catalogItems.find((item) => item.sku.trim().toLowerCase() === tag)
    if (exact) return { catalogItem: exact, confidence: 1 }
  }

  const descriptionTokens = tokenize(component.description)
  if (descriptionTokens.size === 0) return { catalogItem: null, confidence: 0 }

  let best: CatalogItem | null = null
  let bestScore = 0
  for (const item of catalogItems) {
    const catalogTokens = tokenize(`${item.description} ${item.family} ${item.series}`)
    const score = jaccard(descriptionTokens, catalogTokens)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  if (best && bestScore >= MATCH_THRESHOLD) {
    return { catalogItem: best, confidence: bestScore }
  }
  return { catalogItem: null, confidence: bestScore }
}
