import type { CatalogItem, ExtractedComponent } from '@shared/types/entities'

// Below this, a normalized-text match is too weak to trust automatically —
// the line is left unmatched, flagged for a human to resolve via the
// catalog-resolve flow (search/add-to-catalog from the Flags panel or a
// double-click on the quotation line).
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

// Defensive safety net for vocabulary drift between an extraction's wording
// and the catalog's — applied to both sides of the match so it works even
// when the AI doesn't follow the prompt's own normalization rule (e.g. an
// older cached extraction, or a site abbreviation not yet covered there).
const SYNONYMS: Record<string, string> = {
  rcd: 'rccb',
  dp: '2p',
  sp: '1p',
  tp: '3p',
  fp: '4p'
}

function tokenize(text: string): Set<string> {
  const normalized = normalize(text)
  if (!normalized.length) return new Set()
  return new Set(normalized.split(' ').map((token) => SYNONYMS[token] ?? token))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const token of a) {
    if (b.has(token)) overlap++
  }
  return overlap / (a.size + b.size - overlap)
}

function findBestMatch(
  descriptionTokens: Set<string>,
  catalogItems: CatalogItem[]
): { item: CatalogItem | null; score: number } {
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
  return { item: best, score: bestScore }
}

// preferredBrands (Settings > Preferred Brands) is optional and defaults to
// no preference. When set, a catalog item from a preferred brand is used
// over a higher-scoring match from another brand — but only if a preferred-
// brand item actually clears the match threshold; otherwise this defers to
// the best match from any brand, so a component is never left unmatched
// just because its preferred brand doesn't carry it.
export function matchComponent(
  component: ExtractedComponent,
  catalogItems: CatalogItem[],
  preferredBrands: string[] = []
): MatchResult {
  const tag = component.tag.trim().toLowerCase()
  if (tag) {
    const exact = catalogItems.find((item) => item.sku.trim().toLowerCase() === tag)
    if (exact) return { catalogItem: exact, confidence: 1 }
  }

  const descriptionTokens = tokenize(component.description)
  if (descriptionTokens.size === 0) return { catalogItem: null, confidence: 0 }

  if (preferredBrands.length > 0) {
    const preferredSet = new Set(preferredBrands.map((b) => b.trim().toLowerCase()))
    const preferredItems = catalogItems.filter((item) =>
      preferredSet.has(item.maker.trim().toLowerCase())
    )
    const preferredMatch = findBestMatch(descriptionTokens, preferredItems)
    if (preferredMatch.item && preferredMatch.score >= MATCH_THRESHOLD) {
      return { catalogItem: preferredMatch.item, confidence: preferredMatch.score }
    }
  }

  const { item: best, score: bestScore } = findBestMatch(descriptionTokens, catalogItems)
  if (best && bestScore >= MATCH_THRESHOLD) {
    return { catalogItem: best, confidence: bestScore }
  }
  return { catalogItem: null, confidence: bestScore }
}
