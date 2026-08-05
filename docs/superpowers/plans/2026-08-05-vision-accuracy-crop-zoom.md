# Vision Accuracy Part 3 (Per-Panel Crop-and-Zoom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third extraction pass that crops and re-renders each detected panel region at high resolution, then reviews those crops for components/flags the first two passes missed — while also closing an existing code-level-dedup gap in the pass-2 merge.

**Architecture:** `ClaudeProvider.extractComponents()` grows from two Claude calls to three. Pass 1 (draft) now also reports `panels` (dashed-box regions per page). Pass 2 (verification, unchanged logic) runs as today. Pass 3 (new) groups `panels` by page, crops+re-renders each one from the original PDF at high resolution via a refactored `pdfRenderer.ts`, sends one bundled call per page, and merges results through a new shared dedup helper — which pass 2's merge also adopts.

**Tech Stack:** TypeScript, `pdfjs-dist@4.10.38` (pinned — do not upgrade, see [[pdfjs-version-pin]]), `@napi-rs/canvas`, `@anthropic-ai/sdk`, Vitest.

## Global Constraints

- `TARGET_LONG_EDGE_PX = 1568` — existing whole-page render target, unchanged.
- `MAX_CROP_LONG_EDGE_PX = 2400` — cap on a panel crop's long edge in pixels.
- `MIN_CROP_BOX_FRACTION = 0.01` — a panel's `boundingBox.width` or `.height` below this fraction of the page is treated as malformed and skipped.
- `DEDUP_IOU_THRESHOLD = 0.3` — bounding-box IoU at or above this counts as a geometric match.
- `DEDUP_CENTER_DISTANCE = 0.05` — normalized-page-coordinate center distance fallback when IoU doesn't clear the threshold but both boxes are present.
- Crop-zoom always runs, for every extraction, no Settings toggle.
- One Claude call per page (bundling all of that page's panel crops), not one call per panel.
- Code-level dedup applies to **both** the pass-2 (verification) merge and the new pass-3 (crop-zoom) merge.
- No changes to `AIProvider`'s public interface, `ExtractionResult`'s shape, or `ai.ipc.ts`'s orchestration — this stays entirely inside `ClaudeProvider.extractComponents()`.
- No visual UI distinction between which pass found a given component/flag.

Every task's requirements implicitly include this section. Full rationale: `docs/superpowers/specs/2026-08-05-vision-accuracy-crop-zoom-design.md`.

---

### Task 1: Panel detection schema and normalization

**Files:**
- Modify: `src/main/ai/extractionSchema.ts`
- Test: `src/main/ai/extractionSchema.test.ts`

**Interfaces:**
- Consumes: existing `boundingBoxJsonSchema`, `validateBoundingBox`, `AnnotationBoundingBox` (already imported in this file).
- Produces: `ExtractedPanel` interface (`{ pageNumber: number; panelName: string; boundingBox: AnnotationBoundingBox | null }`), `buildPanelItemSchema(): Record<string, unknown>`, `normalizePanel(raw: unknown): ExtractedPanel`. `normalizeExtractionPayload` now returns `{ components, flags, panels }` instead of `{ components, flags }`. `buildExtractionJsonSchema` now includes a required `panels` array in its output schema.

- [ ] **Step 1: Write the failing tests**

Add to `src/main/ai/extractionSchema.test.ts` (append after the existing `normalizeFlag` describe block, before `normalizeVerificationPayload`):

```ts
describe('normalizePanel', () => {
  it('fills in defaults for a minimal input', () => {
    expect(normalizePanel({})).toEqual({
      pageNumber: 1,
      panelName: 'UNKNOWN',
      boundingBox: null
    })
  })

  it('passes through a valid boundingBox and trims panelName', () => {
    const result = normalizePanel({
      pageNumber: 4,
      panelName: '  250A DB-G1  ',
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    })
    expect(result).toEqual({
      pageNumber: 4,
      panelName: '250A DB-G1',
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    })
  })

  it('rejects an out-of-range boundingBox as null, same as components/flags', () => {
    const result = normalizePanel({
      pageNumber: 1,
      panelName: 'X',
      boundingBox: { x: 1.5, y: 0, width: 0.1, height: 0.1 }
    })
    expect(result.boundingBox).toBeNull()
  })
})

describe('normalizeExtractionPayload panels', () => {
  it('normalizes a panels array alongside components and flags', () => {
    const result = normalizeExtractionPayload({
      components: [],
      flags: [],
      panels: [
        { pageNumber: 4, panelName: '250A DB-G1', boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 } }
      ]
    })
    expect(result.panels).toHaveLength(1)
    expect(result.panels[0].panelName).toBe('250A DB-G1')
  })

  it('defaults panels to an empty array when missing from the payload', () => {
    const result = normalizeExtractionPayload({ components: [], flags: [] })
    expect(result.panels).toEqual([])
  })
})
```

Also update the existing `import` line at the top of the test file to include the two new names:

```ts
import {
  normalizeExtractionPayload,
  normalizeComponent,
  normalizeFlag,
  normalizePanel,
  normalizeVerificationPayload
} from './extractionSchema'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/ai/extractionSchema.test.ts`
Expected: FAIL — `normalizePanel` is not exported / not defined.

- [ ] **Step 3: Implement**

In `src/main/ai/extractionSchema.ts`:

Add near the top, after the existing imports:

```ts
export interface ExtractedPanel {
  pageNumber: number
  panelName: string
  boundingBox: AnnotationBoundingBox | null
}
```

Add a new function after `buildFlagItemSchema`:

```ts
export function buildPanelItemSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      pageNumber: { type: 'integer', description: '1-based page this panel appears on' },
      panelName: {
        type: 'string',
        description:
          'The panel/BOM title, formatted as "<incomer rated current> <panel name>" ' +
          '(e.g. "250A DB-G1") — same format as a component\'s panelName field.'
      },
      boundingBox: boundingBoxJsonSchema
    },
    required: ['pageNumber', 'panelName', 'boundingBox'],
    additionalProperties: false
  }
}
```

Modify `buildExtractionJsonSchema` (add `panels` alongside `components`/`flags`):

```ts
export function buildExtractionJsonSchema(
  enabledComponentTypes: string[]
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      components: { type: 'array', items: buildComponentItemSchema(enabledComponentTypes) },
      flags: { type: 'array', items: buildFlagItemSchema() },
      panels: { type: 'array', items: buildPanelItemSchema() }
    },
    required: ['components', 'flags', 'panels'],
    additionalProperties: false
  }
}
```

Add `normalizePanel` after `normalizeFlag`:

```ts
export function normalizePanel(raw: unknown): ExtractedPanel {
  const p = raw as Partial<ExtractedPanel> | null | undefined
  return {
    pageNumber: Number(p?.pageNumber) || 1,
    panelName: String(p?.panelName ?? '').trim() || 'UNKNOWN',
    boundingBox: validateBoundingBox(p?.boundingBox)
  }
}
```

Modify `RawExtractionPayload` and `normalizeExtractionPayload`:

```ts
interface RawExtractionPayload {
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
  panels: ExtractedPanel[]
}

export function normalizeExtractionPayload(parsed: unknown): RawExtractionPayload {
  const obj = parsed as Partial<RawExtractionPayload> | null
  const components = Array.isArray(obj?.components) ? obj.components : []
  const flags = Array.isArray(obj?.flags) ? obj.flags : []
  const panels = Array.isArray(obj?.panels) ? obj.panels : []

  return {
    components: components.map(normalizeComponent),
    flags: flags.map(normalizeFlag),
    panels: panels.map(normalizePanel)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/ai/extractionSchema.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. `ClaudeProvider.ts` still destructures only `{ components, flags }` from `normalizeExtractionPayload`'s result at this point — that's fine, TypeScript allows ignoring extra object properties.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/extractionSchema.ts src/main/ai/extractionSchema.test.ts
git commit -m "feat: add panel detection to the draft extraction schema"
```

---

### Task 2: Dedup helpers

**Files:**
- Create: `src/main/ai/dedup.ts`
- Test: `src/main/ai/dedup.test.ts`

**Interfaces:**
- Consumes: `AnnotationBoundingBox`, `ExtractedComponent`, `ExtractionFlag` from `@shared/types/entities`.
- Produces: `DEDUP_IOU_THRESHOLD`, `DEDUP_CENTER_DISTANCE` constants; `boundingBoxesLikelyMatch(a, b): boolean`; `dedupeComponents(existing, candidates): ExtractedComponent[]`; `dedupeFlags(existing, candidates): ExtractionFlag[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/main/ai/dedup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { boundingBoxesLikelyMatch, dedupeComponents, dedupeFlags } from './dedup'
import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

function component(overrides: Partial<ExtractedComponent> = {}): ExtractedComponent {
  return {
    description: '63A 3P MCCB',
    qty: 1,
    uom: '',
    tag: '',
    pageNumber: 1,
    panelName: '250A DB-G1',
    componentType: 'MCCB',
    confidence: 0.9,
    notes: '',
    boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.05 },
    ...overrides
  }
}

function flag(overrides: Partial<ExtractionFlag> = {}): ExtractionFlag {
  return {
    pageNumber: 1,
    message: 'Spare provision',
    severity: 'info',
    boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.05 },
    ...overrides
  }
}

describe('boundingBoxesLikelyMatch', () => {
  it('matches identical boxes', () => {
    const box = { x: 0.1, y: 0.1, width: 0.1, height: 0.05 }
    expect(boundingBoxesLikelyMatch(box, { ...box })).toBe(true)
  })

  it('matches boxes with high overlap but not identical', () => {
    const a = { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }
    const b = { x: 0.105, y: 0.105, width: 0.1, height: 0.1 }
    expect(boundingBoxesLikelyMatch(a, b)).toBe(true)
  })

  it('does not match boxes far apart on the page', () => {
    const a = { x: 0.1, y: 0.1, width: 0.05, height: 0.05 }
    const b = { x: 0.8, y: 0.8, width: 0.05, height: 0.05 }
    expect(boundingBoxesLikelyMatch(a, b)).toBe(false)
  })

  it('treats a missing box on either side as neutral (true), not a mismatch', () => {
    const box = { x: 0.1, y: 0.1, width: 0.1, height: 0.05 }
    expect(boundingBoxesLikelyMatch(null, box)).toBe(true)
    expect(boundingBoxesLikelyMatch(box, null)).toBe(true)
    expect(boundingBoxesLikelyMatch(null, null)).toBe(true)
  })
})

describe('dedupeComponents', () => {
  it('drops a candidate matching an existing component by page + box + tag', () => {
    const existing = [component({ tag: 'MCB-3' })]
    const candidates = [component({ tag: 'MCB-3', description: 'differently phrased' })]
    expect(dedupeComponents(existing, candidates)).toEqual([])
  })

  it('drops a candidate matching an existing component by page + box + description when tags are empty', () => {
    const existing = [component({ tag: '' })]
    const candidates = [component({ tag: '' })]
    expect(dedupeComponents(existing, candidates)).toEqual([])
  })

  it('keeps a candidate on a different page even if otherwise identical', () => {
    const existing = [component({ pageNumber: 1 })]
    const candidates = [component({ pageNumber: 2 })]
    expect(dedupeComponents(existing, candidates)).toEqual(candidates)
  })

  it('keeps a candidate whose description and tag both differ from anything existing', () => {
    const existing = [component({ tag: 'MCB-3', description: '63A 3P MCCB' })]
    const candidates = [component({ tag: 'MCB-9', description: '32A 1P MCB', boundingBox: { x: 0.9, y: 0.9, width: 0.05, height: 0.05 } })]
    expect(dedupeComponents(existing, candidates)).toEqual(candidates)
  })
})

describe('dedupeFlags', () => {
  it('drops a candidate matching an existing flag by page + box + message', () => {
    const existing = [flag()]
    const candidates = [flag()]
    expect(dedupeFlags(existing, candidates)).toEqual([])
  })

  it('keeps a candidate with a different message', () => {
    const existing = [flag({ message: 'Spare provision' })]
    const candidates = [flag({ message: 'Illegible rating' })]
    expect(dedupeFlags(existing, candidates)).toEqual(candidates)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/ai/dedup.test.ts`
Expected: FAIL — `./dedup` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/main/ai/dedup.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/ai/dedup.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/dedup.ts src/main/ai/dedup.test.ts
git commit -m "feat: add bounding-box-aware dedup helpers for merging AI extraction passes"
```

---

### Task 3: Apply dedup to the existing verification merge

**Files:**
- Modify: `src/main/ai/ClaudeProvider.ts:1-13` (imports), `~199-201` (the verification merge block — line numbers approximate, locate by the `normalizeVerificationPayload` call and the two `.push(...)` lines immediately after it)

**Interfaces:**
- Consumes: `dedupeComponents`, `dedupeFlags` from `./dedup` (Task 2).

This closes an existing known gap: part 2's merge is currently prompt-only. No new panels/cropping logic yet — this task only swaps the merge mechanism for the pass that already exists.

- [ ] **Step 1: Locate and read the current merge code**

In `src/main/ai/ClaudeProvider.ts`, find:

```ts
      const verificationTextBlock = verificationMessage.content.find(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      )
      if (verificationTextBlock) {
        const verificationParsed = JSON.parse(verificationTextBlock.text)
        const { missedComponents, additionalFlags } = normalizeVerificationPayload(verificationParsed)
        components.push(...missedComponents)
        flags.push(...additionalFlags)
      }
```

- [ ] **Step 2: Implement**

Add the import at the top of `ClaudeProvider.ts`, alongside the existing `./extractionSchema` import:

```ts
import { dedupeComponents, dedupeFlags } from './dedup'
```

Replace the two `.push(...)` lines found in Step 1 with:

```ts
        components.push(...dedupeComponents(components, missedComponents))
        flags.push(...dedupeFlags(flags, additionalFlags))
```

(Everything else in that block — parsing, the `if (verificationTextBlock)` guard — stays exactly as-is.)

- [ ] **Step 3: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS — this file has no dedicated unit tests (matches this codebase's convention of live-verifying `ClaudeProvider.ts` rather than mocking the Anthropic SDK), so this is purely a regression check that nothing else broke.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`.
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/ClaudeProvider.ts
git commit -m "fix: dedup verification-pass results before merging into the draft"
```

---

### Task 4: Reusable PDF document loading + panel crop rendering

**Files:**
- Modify: `src/main/ai/pdfRenderer.ts`
- Modify: `src/main/ai/ClaudeProvider.ts` (pass-1 rendering call site only — no new crop-zoom logic yet)
- Test: `src/main/ai/pdfRenderer.test.ts`

**Interfaces:**
- Consumes: `AnnotationBoundingBox` from `@shared/types/entities`; existing `computeRenderScale`.
- Produces: `MAX_CROP_LONG_EDGE_PX`, `MIN_CROP_BOX_FRACTION` constants; `isValidPanelBox(boundingBox): boolean`; `computeCropPixelRect(pageWidthPt, pageHeightPt, boundingBox, cropScale): { x, y, width, height }`; `loadPdfDocument(pdfBytes): Promise<PDFDocumentProxy>`; `renderPdfPagesToImages(pdfDoc: PDFDocumentProxy): Promise<{ pageNumber, base64Png }[]>` (**signature change** — now takes a loaded document, not raw bytes); `renderPdfPanelCrop(pdfDoc, pageNumber, boundingBox): Promise<string | null>`.

This task changes `renderPdfPagesToImages`'s signature (it no longer loads or destroys the PDF document itself — the caller does, so the same document can be reused for panel crops in Task 6). `ClaudeProvider.ts`'s pass-1 render call site must be updated in this same task or the build breaks.

- [ ] **Step 1: Write the failing tests**

First, update the existing import line at the top of `src/main/ai/pdfRenderer.test.ts` from:

```ts
import { computeRenderScale } from './pdfRenderer'
```

to:

```ts
import { computeCropPixelRect, computeRenderScale, isValidPanelBox, MIN_CROP_BOX_FRACTION } from './pdfRenderer'
```

Then append after the existing `computeRenderScale` describe block:

```ts
describe('isValidPanelBox', () => {
  it('accepts a normal-sized panel box', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: 0.3, height: 0.2 })).toBe(true)
  })

  it('rejects a box narrower than MIN_CROP_BOX_FRACTION', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: MIN_CROP_BOX_FRACTION / 2, height: 0.2 })).toBe(false)
  })

  it('rejects a box shorter than MIN_CROP_BOX_FRACTION', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: 0.2, height: MIN_CROP_BOX_FRACTION / 2 })).toBe(false)
  })

  it('accepts a box exactly at the MIN_CROP_BOX_FRACTION boundary', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: MIN_CROP_BOX_FRACTION, height: MIN_CROP_BOX_FRACTION })).toBe(true)
  })
})

describe('computeCropPixelRect', () => {
  it('computes the pixel rect for a panel box at a given page size and scale', () => {
    // A4 portrait at scale 2 (points -> px): page becomes 1190 x 1684
    const rect = computeCropPixelRect(595, 842, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 2)
    expect(rect).toEqual({
      x: 0.1 * 595 * 2,
      y: 0.2 * 842 * 2,
      width: 0.3 * 595 * 2,
      height: 0.4 * 842 * 2
    })
  })

  it('produces a rect matching the full page when the box covers it entirely', () => {
    const rect = computeCropPixelRect(595, 842, { x: 0, y: 0, width: 1, height: 1 }, 1)
    expect(rect).toEqual({ x: 0, y: 0, width: 595, height: 842 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/ai/pdfRenderer.test.ts`
Expected: FAIL — `computeCropPixelRect`, `isValidPanelBox`, `MIN_CROP_BOX_FRACTION` not exported yet.

- [ ] **Step 3: Implement `pdfRenderer.ts`**

Replace the full contents of `src/main/ai/pdfRenderer.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/ai/pdfRenderer.test.ts`
Expected: PASS, all tests including the new ones. The pre-existing `computeRenderScale` tests must still pass unchanged.

- [ ] **Step 5: Update `ClaudeProvider.ts`'s pass-1 render call site**

`renderPdfPagesToImages` no longer accepts raw bytes or destroys the document — `ClaudeProvider.ts` now owns that lifecycle so the same loaded document can be reused for panel crops in Task 6.

Replace the existing `./pdfRenderer` import line at the top of `src/main/ai/ClaudeProvider.ts`:

```ts
import { renderPdfPagesToImages } from './pdfRenderer'
```

with:

```ts
import { loadPdfDocument, renderPdfPagesToImages } from './pdfRenderer'
import type { PDFDocumentProxy } from 'pdfjs-dist'
```

Find the current rendering block:

```ts
    onProgress?.({ pct: 10, stage: 'Rendering pages' })
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pages = await renderPdfPagesToImages(pdfBytes)
    } catch (error) {
      console.error('[ai:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }
```

Replace it with:

```ts
    onProgress?.({ pct: 10, stage: 'Rendering pages' })
    let pdfDoc: PDFDocumentProxy
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pdfDoc = await loadPdfDocument(pdfBytes)
      pages = await renderPdfPagesToImages(pdfDoc)
    } catch (error) {
      console.error('[ai:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }
```

Then wrap **everything from this point to the end of the method** (the rest of `extractComponents`'s body, from the `onProgress?.({ pct: 15, stage: 'Sending to Claude' })` line through the final `return { model: this.model, components, flags, usage: totalUsage }`) in a `try { ... } finally { await pdfDoc.destroy() }` block. Concretely, the method's overall shape becomes:

```ts
  async extractComponents({
    pdfBytes,
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules,
    onProgress
  }: ExtractParams): Promise<ExtractionResult> {
    onProgress?.({ pct: 5, stage: 'Reading PDF' })

    onProgress?.({ pct: 10, stage: 'Rendering pages' })
    let pdfDoc: PDFDocumentProxy
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pdfDoc = await loadPdfDocument(pdfBytes)
      pages = await renderPdfPagesToImages(pdfDoc)
    } catch (error) {
      console.error('[ai:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }

    try {
      // ...everything that was already here, unchanged, from
      // `onProgress?.({ pct: 15, stage: 'Sending to Claude' })`
      // through the final `return { model: this.model, components, flags, usage: totalUsage }`...
    } finally {
      await pdfDoc.destroy()
    }
  }
```

Do not change any logic inside that inner block in this task — only add the `try {` right before `onProgress?.({ pct: 15, ... })` and the `} finally { await pdfDoc.destroy() }` right after the existing `return` statement, adjusting indentation of everything in between to stay inside the new `try` block.

- [ ] **Step 6: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`.
Expected: no errors. This step matters more than usual here — the `try`/`finally` re-indentation from Step 5 is mechanical but easy to get wrong (a stray brace breaks the whole file).

- [ ] **Step 8: Commit**

```bash
git add src/main/ai/pdfRenderer.ts src/main/ai/pdfRenderer.test.ts src/main/ai/ClaudeProvider.ts
git commit -m "refactor: reuse a loaded PDF document for page rendering and add panel-crop rendering"
```

---

### Task 5: Crop-zoom system prompt

**Files:**
- Modify: `src/main/ai/promptTemplates.ts`

**Interfaces:**
- Consumes: existing `buildExtractionRulesSection`, `ExtractedComponent`, `ExtractionFlag` (already imported in this file).
- Produces: `buildCropZoomSystemPrompt(enabledComponentTypes, catalogDescriptions, preferredBrands, customRules, pageComponents, pageFlags): string`.

No unit test for this task — matches this codebase's existing convention (`buildExtractionSystemPrompt`/`buildVerificationSystemPrompt` have no dedicated tests either; prompt text is live-verified through actual extraction results, not asserted against in tests).

- [ ] **Step 1: Implement**

Add to the end of `src/main/ai/promptTemplates.ts`:

```ts
export function buildCropZoomSystemPrompt(
  enabledComponentTypes: string[],
  catalogDescriptions: string[],
  preferredBrands: string[],
  customRules: string[],
  pageComponents: ExtractedComponent[],
  pageFlags: ExtractionFlag[]
): string {
  // Only the rules, not buildExtractionSystemPrompt's full framing — same
  // reasoning as buildVerificationSystemPrompt.
  const extractionRules = buildExtractionRulesSection(
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules
  )

  const componentSummary = pageComponents.length
    ? pageComponents
        .map(
          (c) =>
            `- [${c.panelName}] ×${c.qty} ${c.description}${c.tag ? ` (tag: ${c.tag})` : ''}`
        )
        .join('\n')
    : '(none)'

  const flagSummary = pageFlags.length
    ? pageFlags.map((f) => `- ${f.message}`).join('\n')
    : '(none)'

  return `You are reviewing zoomed-in crops of specific panel regions from one page of
a Single Line Diagram, to catch anything the earlier passes missed because
it was too small or dense to make out at whole-page scale. Each crop image
is preceded by a label identifying which panel it's from. You are NOT
re-extracting the whole page — the list below is already correct and
complete unless a zoomed crop shows something specific and concrete it's
missing.

## What was already extracted on this page

Each line is one BOM line, not one physical item: \`×N\` is the quantity
already extracted for it. Identical items in the same panel are grouped,
so a line reading "×6" already accounts for all six of those on the
drawing — that is not five missing items.

${componentSummary}

## What was already flagged on this page

${flagSummary}

## Your task

1. Look through each zoomed panel crop for any component that is visible
   but NOT in the list above. For each one you find, add it to
   \`missedComponents\`, following the exact same description formatting,
   component-type recognition, and business rules below as the earlier
   passes used — a missed component still needs to follow every rule
   (breaker formatting, cable sizing, PFR expansion, etc.).
2. Look for any item already in the list above whose rating looks
   internally inconsistent with what's shown in a crop (e.g. a noted
   cable size that doesn't match a stated busbar/cable choice). Do NOT
   edit the original list — instead, add an \`additionalFlags\` entry so a
   human can resolve it. Do not repeat any flag already listed above.
3. If you find nothing to add in either category, return empty arrays for
   both. Do not invent problems to report — only real, specific ones.

## Reference: the same rules the earlier passes followed

These are description-formatting and business rules only — reference
material for phrasing anything you add. They are not an instruction to
extract the page again.

${extractionRules}

Remember: you are reviewing zoomed crops for things too small or dense to
catch at whole-page scale, not re-extracting. \`missedComponents\` is only
for components genuinely absent from the list above, and
\`additionalFlags\` only for problems not already flagged above.

Respond only with the structured verification result — no prose.`
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/promptTemplates.ts
git commit -m "feat: add crop-zoom system prompt"
```

---

### Task 6: Wire the crop-zoom pass into `extractComponents()`

**Files:**
- Modify: `src/main/ai/ClaudeProvider.ts`

**Interfaces:**
- Consumes: `ExtractedPanel` and updated `normalizeExtractionPayload` (Task 1), `dedupeComponents`/`dedupeFlags` (Task 2, already wired for pass 2 in Task 3), `renderPdfPanelCrop` (Task 4), `buildCropZoomSystemPrompt` (Task 5), existing `buildVerificationJsonSchema`/`normalizeVerificationPayload` (reused as-is for the crop-zoom response shape).

This is the task that actually makes part 3 do something. No new unit tests (this file has none, by convention) — full suite regression plus mandatory live verification at the end of this task.

- [ ] **Step 1: Update imports**

In `src/main/ai/ClaudeProvider.ts`, update the `./extractionSchema` import to include `ExtractedPanel`:

```ts
import {
  buildExtractionJsonSchema,
  buildVerificationJsonSchema,
  normalizeExtractionPayload,
  normalizeVerificationPayload,
  type ExtractedPanel
} from './extractionSchema'
```

Update the `./promptTemplates` import:

```ts
import { buildExtractionSystemPrompt, buildVerificationSystemPrompt, buildCropZoomSystemPrompt } from './promptTemplates'
```

Update the `./pdfRenderer` import to include `renderPdfPanelCrop`:

```ts
import { loadPdfDocument, renderPdfPagesToImages, renderPdfPanelCrop } from './pdfRenderer'
```

- [ ] **Step 2: Capture `panels` from the draft parse**

Find (from Task 1's schema change, this line already type-checks even though `panels` was previously ignored):

```ts
    const { components, flags } = normalizeExtractionPayload(parsed)
```

Replace with:

```ts
    const { components, flags, panels } = normalizeExtractionPayload(parsed)
```

- [ ] **Step 3: Add the crop-zoom pass after the verification block**

Find the end of the verification `try`/`catch`/`finally` block (from Task 3, it now ends with `clearInterval(verifyTicker)` inside `finally`), immediately followed by:

```ts
    onProgress?.({ pct: 100, stage: 'Done' })

    return {
      model: this.model,
      components,
      flags,
      usage: totalUsage
    }
```

Insert the new crop-zoom pass **between** the end of the verification block and `onProgress?.({ pct: 100, stage: 'Done' })`:

```ts
    onProgress?.({ pct: 99, stage: 'Zooming into panels' })

    const panelsByPage = new Map<number, ExtractedPanel[]>()
    for (const panel of panels) {
      const list = panelsByPage.get(panel.pageNumber) ?? []
      list.push(panel)
      panelsByPage.set(panel.pageNumber, list)
    }

    for (const [pageNumber, pagePanels] of panelsByPage) {
      const renderedCrops: { panel: ExtractedPanel; base64Png: string }[] = []
      for (const panel of pagePanels) {
        if (!panel.boundingBox) continue
        try {
          const base64Png = await renderPdfPanelCrop(pdfDoc, pageNumber, panel.boundingBox)
          if (base64Png) renderedCrops.push({ panel, base64Png })
        } catch (error) {
          console.error('[ai:renderPdfPanelCrop]', pageNumber, panel.panelName, error)
        }
      }
      if (renderedCrops.length === 0) continue

      const cropContentBlocks = renderedCrops.flatMap(
        ({ panel, base64Png }): Anthropic.Messages.ContentBlockParam[] => [
          { type: 'text', text: `Page ${pageNumber} — Panel: ${panel.panelName}` },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Png } }
        ]
      )

      const pageComponents = components.filter((c) => c.pageNumber === pageNumber)
      const pageFlags = flags.filter((f) => f.pageNumber === pageNumber)

      try {
        const cropZoomStream = this.client.messages.stream({
          model: this.model,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'disabled' },
          system: buildCropZoomSystemPrompt(
            enabledComponentTypes,
            catalogDescriptions,
            preferredBrands,
            customRules,
            pageComponents,
            pageFlags
          ),
          messages: [
            {
              role: 'user',
              content: [
                ...cropContentBlocks,
                {
                  type: 'text',
                  text: 'Review these zoomed panel crops against the already-extracted list as described in the system prompt.'
                }
              ]
            }
          ],
          output_config: {
            format: { type: 'json_schema', schema: buildVerificationJsonSchema(enabledComponentTypes) }
          }
        })
        const cropZoomMessage = await cropZoomStream.finalMessage()
        totalUsage = {
          inputTokens: totalUsage.inputTokens + cropZoomMessage.usage.input_tokens,
          outputTokens: totalUsage.outputTokens + cropZoomMessage.usage.output_tokens
        }

        const cropZoomTextBlock = cropZoomMessage.content.find(
          (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
        )
        if (cropZoomTextBlock) {
          const cropZoomParsed = JSON.parse(cropZoomTextBlock.text)
          const { missedComponents, additionalFlags } = normalizeVerificationPayload(cropZoomParsed)
          components.push(...dedupeComponents(components, missedComponents))
          flags.push(...dedupeFlags(flags, additionalFlags))
        }
      } catch (error) {
        // Same policy as the verification pass: an enhancement failure
        // must never waste an already-successful extraction.
        console.error('[ai:cropZoomExtraction]', pageNumber, error)
      }
    }
```

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`.
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/ClaudeProvider.ts
git commit -m "feat: add per-panel crop-and-zoom extraction pass"
```

---

### Task 7: Full regression and live verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run: `npm run test:all`
Expected: PASS (both the Node vitest suite and the Electron/DB suite).

- [ ] **Step 2: Build check**

Run: `npm run typecheck`, then confirm the app still builds/launches:

Run: `npm run dev`
Expected: launches without a startup crash, same as any other change to `src/main`.

- [ ] **Step 3: Live verification (cannot be automated — ask the user)**

Ask the user to re-run extraction, in the running app, on the same real SLD where page 4's MCCBs were previously missed (and ideally 1-2 other previously-problematic ones), and report back:

1. Does a "Zooming into panels" progress stage appear during extraction?
2. Are the previously-missing components (page 4's last MCCBs) now present in the result?
3. Are there any new **duplicate** BOM lines or duplicate flags? This is the specific risk to watch for — crop-zoom is a third source of components on top of verification, and even with code-level dedup in place (Tasks 2/3/6), real-world confirmation that it's actually catching what it should cannot be substituted by any automated test.

If duplicates do appear despite the dedup pass, the fix is tuning `DEDUP_IOU_THRESHOLD`/`DEDUP_CENTER_DISTANCE` (both named constants in `src/main/ai/dedup.ts`) or the text-similarity check — not disabling the pass.

- [ ] **Step 4: Update project memory**

Once the user confirms results, update the `project-vision-accuracy-roadmap` memory with the outcome (fixed / partially fixed / new issue found) — this is the third and final part of that roadmap.
