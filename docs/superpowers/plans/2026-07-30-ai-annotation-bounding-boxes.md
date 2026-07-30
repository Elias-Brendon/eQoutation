# AI Annotation Bounding Boxes + Click-to-Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-corner-stacked AI annotation pins (shipped earlier this session) with real bounding-box rectangles drawn around the actual flagged component/region, styled with the app's theme accent color instead of an arbitrary purple, and let clicking a flag in the Flags panel jump to and highlight its box on the PDF.

**Architecture:** The Claude extraction schema gains an optional per-component and per-flag `boundingBox` (normalized 0-1 page coordinates), requested directly in the prompt. `quotations.ipc.ts` threads that box through to `createAiAnnotation`, which now stores `shape_type: 'rectangle'` instead of `'pin'` (falling back to a small fixed-size box at the old stacked anchor when the model didn't supply one). Rendering moves AI-authored rectangles out of the shared canvas-drawn path (used by human freehand/circle/rectangle tools) into a dedicated absolutely-positioned overlay so they can be interactive: click-to-highlight reuses the existing `onFocusLine`/`focusPage` plumbing pattern, adding a parallel `onFocusFlag`/`highlightedAnnotationId` path that looks up an annotation by its linked flag id and pulses it.

**Tech Stack:** Anthropic Messages API structured output (`output_config.format`), Electron main process (better-sqlite3), React 19 + TanStack Query renderer, Vitest.

## Design Decisions (read before implementing — these resolve ambiguity in the original request)

- **Bounding box source:** the AI is asked to estimate one directly (new schema field), not derived from any existing data — no such spatial data exists today. Best-effort; `null` is valid when the model can't localize something (e.g., a flag about the drawing as a whole). When `null`, a component/flag still gets an annotation, just at a small fixed-size fallback box (reusing the previous stacked-anchor position) rather than no annotation at all.
- **Which flags get a real box vs. the fallback:** unchanged from the existing feature — only `origin: 'ai'` flags get annotations at all (`origin: 'matcher'`/`'human'` untouched, no non-goal changes here).
- **Theme color:** `var(--color-accent)` (`#f2652c` in `globals.css`), the same orange already used for every other AI-related affordance in this app (Sparkles icons, "AI extraction"/"Re-generate" buttons, the "AI GENERATION" progress bar). Stored as the literal CSS variable reference in the `color` column (not a resolved hex), so a future theme change is picked up automatically by existing rows too.
- **Rendering mechanism:** AI rectangles render as an HTML overlay `<div>` (like the existing pin markers did), **not** through the canvas `strokeBoxShape` path used by human-drawn circle/rectangle tools. This is required for interactivity (hover title, highlight animation) and keeps human-tool rendering completely untouched — zero risk of regressing existing freehand/circle/rectangle behavior.
- **Existing pin-shaped AI annotations (created earlier this session, before this change):** left exactly as they render today — the pin rendering path in `AnnotationCanvas.tsx` is untouched, so old rows still show as pins. Only annotations created going forward (via the updated `createAiAnnotation`) become rectangles. Consistent with the "no backfill" precedent from the original AI-annotations feature.
- **Click-to-highlight scope:** wired from the **Flags panel** only (real `Flag` DB rows with a stable id that can be looked up against `annotations.linked_flag_id`). The `ExtractionPanel`'s flag list is a pre-quotation preview of raw `extraction.flags` array entries with no stable id — out of scope, unchanged.
- **Bounding-box ↔ quotation-line pairing:** `getLinesForQuotation` re-queries lines sorted by `page_number, created_at`, which is **not guaranteed** to match `extraction.components` array order (ties on identical timestamps/pages are common in this dataset — many duplicate "100A 3P 10kA MCB" lines). Rather than guess-matching by page/description (unreliable — duplicates exist), `QuotationLineInput` gains a caller-supplied `id`, generated up front in `quotations.ipc.ts` so it can reliably zip each line back to its originating `ExtractedComponent` (and that component's `boundingBox`) by array index, with no re-query needed.

## Global Constraints

- No changes to human-authored annotation behavior (freehand/pin/circle/rectangle/text tools, undo/redo, clear-page) — every change here is scoped to `authorType === 'ai'`.
- No backfill of existing AI flags/annotations from before this change (matches the existing feature's non-goal).
- AI annotations remain non-deletable by users (existing `handleMarkerClick` early-return for `authorType === 'ai'` stays in place).
- DB-touching tests are `*.dbtest.ts` run via `npm run test:db`. Pure-logic tests are `*.test.ts` run via `npm run test`.

---

### Task 1: Shared types — bounding box

**Files:**
- Modify: `src/shared/types/entities.ts`

**Interfaces:**
- Produces: `export interface AnnotationBoundingBox { x: number; y: number; width: number; height: number }`, `ExtractedComponent.boundingBox: AnnotationBoundingBox | null`, `ExtractionFlag.boundingBox: AnnotationBoundingBox | null` — consumed by Task 2 (schema), Task 5 (quotations.ipc.ts).

- [ ] **Step 1: Add the bounding box type and wire it into the two extraction types**

In `src/shared/types/entities.ts`, add just above `ExtractedComponent` (currently at line 322):

```ts
export interface AnnotationBoundingBox {
  x: number
  y: number
  width: number
  height: number
}
```

Modify `ExtractedComponent`:

```ts
export interface ExtractedComponent {
  description: string
  qty: number
  uom: string
  tag: string
  pageNumber: number
  panelName: string
  /** The recognized component type this belongs to (e.g. "MCCB", "Contactor") — used to resolve a per-type preferred brand at match time. */
  componentType: string
  confidence: number
  notes: string
  boundingBox: AnnotationBoundingBox | null
}
```

Modify `ExtractionFlag`:

```ts
export interface ExtractionFlag {
  pageNumber: number
  message: string
  severity: ExtractionFlagSeverity
  boundingBox: AnnotationBoundingBox | null
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `extractionSchema.ts`'s `normalizeExtractionPayload` doesn't populate the new required fields yet. Confirm the only failures are there; fixed in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/entities.ts
git commit -m "feat: add AnnotationBoundingBox type to extraction entities"
```

---

### Task 2: Extraction schema — request and parse bounding boxes

**Files:**
- Modify: `src/main/ai/extractionSchema.ts`
- Create: `src/main/ai/extractionSchema.test.ts`

**Interfaces:**
- Consumes: `AnnotationBoundingBox` (Task 1).
- Produces (consumed by Task 3 — prompt; Task 5 — `quotations.ipc.ts`): `normalizeExtractionPayload` populates `boundingBox` on every component/flag.

- [ ] **Step 1: Write the failing tests**

Create `src/main/ai/extractionSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeExtractionPayload } from './extractionSchema'

describe('normalizeExtractionPayload boundingBox handling', () => {
  it('passes through a valid boundingBox on a component', () => {
    const result = normalizeExtractionPayload({
      components: [
        {
          description: 'MCCB',
          qty: 1,
          uom: '',
          tag: '',
          pageNumber: 1,
          panelName: 'UNKNOWN',
          componentType: 'MCCB',
          confidence: 0.9,
          notes: '',
          boundingBox: { x: 0.1, y: 0.2, width: 0.05, height: 0.03 }
        }
      ],
      flags: []
    })
    expect(result.components[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.05, height: 0.03 })
  })

  it('normalizes a missing boundingBox to null', () => {
    const result = normalizeExtractionPayload({
      components: [
        {
          description: 'MCCB',
          qty: 1,
          uom: '',
          tag: '',
          pageNumber: 1,
          panelName: 'UNKNOWN',
          componentType: 'MCCB',
          confidence: 0.9,
          notes: ''
        }
      ],
      flags: []
    })
    expect(result.components[0].boundingBox).toBeNull()
  })

  it('rejects a boundingBox with out-of-range or non-numeric fields as null', () => {
    const result = normalizeExtractionPayload({
      components: [
        {
          description: 'MCCB',
          qty: 1,
          uom: '',
          tag: '',
          pageNumber: 1,
          panelName: 'UNKNOWN',
          componentType: 'MCCB',
          confidence: 0.9,
          notes: '',
          boundingBox: { x: 1.5, y: 0.2, width: 0.05, height: 0.03 }
        }
      ],
      flags: []
    })
    expect(result.components[0].boundingBox).toBeNull()
  })

  it('passes through a valid boundingBox on a flag, and null-normalizes an invalid one', () => {
    const result = normalizeExtractionPayload({
      components: [],
      flags: [
        { pageNumber: 1, message: 'ok', severity: 'info', boundingBox: { x: 0, y: 0, width: 0.2, height: 0.1 } },
        { pageNumber: 1, message: 'bad', severity: 'info', boundingBox: { x: 0, y: 0, width: -1, height: 0.1 } }
      ]
    })
    expect(result.flags[0].boundingBox).toEqual({ x: 0, y: 0, width: 0.2, height: 0.1 })
    expect(result.flags[1].boundingBox).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `boundingBox` not yet read/validated by `normalizeExtractionPayload`.

- [ ] **Step 3: Implement the schema and normalization changes**

In `src/main/ai/extractionSchema.ts`, add a bounding box JSON-schema fragment near the top (after the imports):

```ts
const boundingBoxJsonSchema = {
  anyOf: [
    {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' }
      },
      required: ['x', 'y', 'width', 'height'],
      additionalProperties: false
    },
    { type: 'null' }
  ],
  description:
    'Approximate bounding box around this item on its page, normalized 0-1 ' +
    '(x/y = top-left corner, width/height as a fraction of the page). Null ' +
    'if no specific region can be identified.'
}
```

Add `boundingBox: boundingBoxJsonSchema` to the `components.items.properties` object, and add `'boundingBox'` to that item's `required` array (already lists `'description', 'qty', ...`). Do the same for `flags.items.properties` and its `required` array (currently `['pageNumber', 'message', 'severity']`).

Add a `validateBoundingBox` helper and use it in both mapping functions inside `normalizeExtractionPayload`:

```ts
function validateBoundingBox(value: unknown): AnnotationBoundingBox | null {
  const box = value as Partial<AnnotationBoundingBox> | null | undefined
  if (!box || typeof box !== 'object') return null
  const { x, y, width, height } = box
  const nums = [x, y, width, height]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null
  if (x! < 0 || x! > 1 || y! < 0 || y! > 1) return null
  if (width! <= 0 || width! > 1 || height! <= 0 || height! > 1) return null
  return { x: x!, y: y!, width: width!, height: height! }
}
```

Add the import: `import type { AnnotationBoundingBox, ExtractedComponent, ExtractionFlag } from '@shared/types/entities'`.

In `normalizeExtractionPayload`'s `components.map(...)`, add:

```ts
      boundingBox: validateBoundingBox(c?.boundingBox)
```

And in the `flags.map(...)`:

```ts
      boundingBox: validateBoundingBox(f?.boundingBox)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/extractionSchema.ts src/main/ai/extractionSchema.test.ts
git commit -m "feat: request and validate per-item bounding boxes in extraction schema"
```

---

### Task 3: Prompt — ask Claude for bounding boxes

**Files:**
- Modify: `src/main/ai/promptTemplates.ts`

**Interfaces:** none (prompt text only, no code interface changes).

- [ ] **Step 1: Add bounding box instructions to the "Step 5 — Report" section**

In `src/main/ai/promptTemplates.ts`, in the `## Step 5 — Report` section (currently starting around line 214), after the existing paragraph about confidence scoring and before the "Raise a flag for..." paragraph, add:

```
For each component and each flag, also estimate a \`boundingBox\`: the
region on its page that contains it, normalized 0 to 1 (x/y = top-left
corner, width/height as a fraction of the full page — same convention as
how annotation coordinates are stored elsewhere in this app). This does
not need pixel precision — a box that roughly contains the relevant
symbol, label, or text block is enough to point a human reviewer at the
right spot. Set it to null only when no specific region applies (e.g. a
flag about the drawing or panel as a whole, not a specific symbol).
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS (no code changed, just a template literal string).

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/promptTemplates.ts
git commit -m "docs: instruct extraction prompt to estimate per-item bounding boxes"
```

---

### Task 4: `QuotationLineInput` gains a caller-supplied `id`

**Files:**
- Modify: `src/main/db/repositories/quotationsRepo.ts`

**Interfaces:**
- Produces (consumed by Task 5 — `quotations.ipc.ts`): `QuotationLineInput.id: string` (new required field); `createQuotationWithLines` uses it instead of generating its own line ids.

- [ ] **Step 1: Add `id` to the input type and use it in the insert**

In `src/main/db/repositories/quotationsRepo.ts`, modify `QuotationLineInput` (currently at line 88):

```ts
export interface QuotationLineInput {
  id: string
  catalogItemId: string | null
  pageNumber: number
  panelName: string
  tag: string
  sku: string
  componentType: string
  description: string
  maker: string
  qty: number
  uom: string
  listPrice: number
  discountFactor: number
  unitCost: number
  totalCost: number
  margin: number
  quotePrice: number
  matchStatus: QuotationLineMatchStatus
  matchConfidence: number
  aiConfidence: number
}
```

In `createQuotationWithLines`'s transaction loop (`for (const input of lineInputs) { insertLine.run({ id: randomUUID(), ... }) }`), change the row's `id` from a freshly generated one to the caller-supplied one:

```ts
    for (const input of lineInputs) {
      insertLine.run({
        id: input.id,
        quotation_id: quotationId,
        catalog_item_id: input.catalogItemId,
        page_number: input.pageNumber,
        panel_name: input.panelName,
        tag: input.tag,
        sku: input.sku,
        component_type: input.componentType,
        description: input.description,
        maker: input.maker,
        qty: input.qty,
        uom: input.uom,
        list_price: input.listPrice,
        discount_factor: input.discountFactor,
        unit_cost: input.unitCost,
        total_cost: input.totalCost,
        margin: input.margin,
        quote_price: input.quotePrice,
        match_status: input.matchStatus,
        match_confidence: input.matchConfidence,
        ai_confidence: input.aiConfidence,
        created_at: now
      })
    }
```

(Only the `id: input.id` line and removing the now-unused `randomUUID` call for lines changes — the rest of the object is unchanged. `randomUUID` is still used elsewhere in this file for the quotation's own id, so keep the import.)

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `quotations.ipc.ts`'s `lineInputs` map doesn't supply `id` yet. Confirm the only failure is there; fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/main/db/repositories/quotationsRepo.ts
git commit -m "feat: let callers supply quotation line ids for reliable component pairing"
```

---

### Task 5: `quotations.ipc.ts` — thread bounding boxes from components/flags to annotations

**Files:**
- Modify: `src/main/ipc/quotations.ipc.ts`

**Interfaces:**
- Consumes: `QuotationLineInput.id` (Task 4); `ExtractedComponent.boundingBox`/`ExtractionFlag.boundingBox` (Tasks 1-2); `createAiAnnotationsForFlags` new signature (Task 6 — implemented after this task, see note below).
- Produces: none new (internal wiring only).

> Note: this task's code calls `createAiAnnotationsForFlags` with a new second-argument shape that Task 6 introduces. Implement Task 6's repository signature first if executing out of order, or accept that `npm run typecheck` won't be fully green until both Task 5 and Task 6 land — the plan lists them in dependency order (5 before 6) for narrative clarity, but Task 6's repository change has no dependency on Task 5 and can be implemented first if that's easier to keep green. Either order is fine; just don't stop and consider it broken until both are done.

- [ ] **Step 1: Generate line ids up front and pair each line input with its component's bounding box**

In `src/main/ipc/quotations.ipc.ts`, modify the `lineInputs` construction (currently `extraction.components.map((component) => {...})`) to include `id: randomUUID()`:

```ts
    const lineInputs: QuotationLineInput[] = extraction.components.map((component) => {
      const { catalogItem, confidence } = matchComponent(
        component,
        catalogItems,
        resolveEffectivePreferredBrands(component.componentType, {
          preferredBrands,
          preferredBrandsByType
        })
      )
      const unitCost = catalogItem?.unitPrice ?? 0
      const totalCost = component.qty * unitCost
      return {
        id: randomUUID(),
        catalogItemId: catalogItem?.id ?? null,
        pageNumber: component.pageNumber,
        panelName: component.panelName,
        tag: component.tag,
        sku: catalogItem?.sku ?? '',
        componentType: component.componentType ?? '',
        description: catalogItem?.description ?? component.description,
        maker: catalogItem?.maker ?? '',
        qty: component.qty,
        uom: catalogItem?.uom ?? component.uom,
        listPrice: catalogItem?.listPrice ?? 0,
        discountFactor: catalogItem?.discountFactor ?? 1,
        unitCost,
        totalCost,
        margin: defaultMargin,
        quotePrice: totalCost * defaultMargin,
        matchStatus: catalogItem ? 'matched' : 'unknown',
        matchConfidence: confidence,
        aiConfidence: component.confidence
      }
    })
```

- [ ] **Step 2: Rewrite the flag-building loop to iterate `lineInputs`/`extraction.components` directly (not `quotation.lines`), carrying bounding boxes alongside**

Replace the existing block:

```ts
    const flagInputs: CreateFlagInput[] = []
    for (const line of quotation.lines) {
      if (line.matchStatus === 'unknown') {
        flagInputs.push({
          quotationLineId: line.id,
          origin: 'matcher',
          severity: 'warning',
          message: `Unmatched item: "${line.description}" (page ${line.pageNumber}) — no catalog match found.`,
          pageNumber: line.pageNumber
        })
      }
      if (line.aiConfidence < confidenceThreshold) {
        flagInputs.push({
          quotationLineId: line.id,
          origin: 'ai',
          severity: 'warning',
          message: `Low-confidence extraction: "${line.description}" (page ${line.pageNumber}) — AI confidence ${(line.aiConfidence * 100).toFixed(0)}%.`,
          pageNumber: line.pageNumber
        })
      }
    }
    for (const flag of extraction.flags) {
      flagInputs.push({
        quotationLineId: null,
        origin: 'ai',
        severity: flag.severity,
        message: flag.message,
        pageNumber: flag.pageNumber
      })
    }
    if (flagInputs.length > 0) {
      const createdFlags = createFlags(quotation.id, flagInputs)
      createAiAnnotationsForFlags(sldId, createdFlags)
    }
```

with:

```ts
    const flagInputs: CreateFlagInput[] = []
    const flagBoundingBoxes: (AnnotationBoundingBox | null)[] = []
    for (let i = 0; i < lineInputs.length; i++) {
      const lineInput = lineInputs[i]
      const component = extraction.components[i]
      if (lineInput.matchStatus === 'unknown') {
        flagInputs.push({
          quotationLineId: lineInput.id,
          origin: 'matcher',
          severity: 'warning',
          message: `Unmatched item: "${lineInput.description}" (page ${lineInput.pageNumber}) — no catalog match found.`,
          pageNumber: lineInput.pageNumber
        })
        flagBoundingBoxes.push(null)
      }
      if (lineInput.aiConfidence < confidenceThreshold) {
        flagInputs.push({
          quotationLineId: lineInput.id,
          origin: 'ai',
          severity: 'warning',
          message: `Low-confidence extraction: "${lineInput.description}" (page ${lineInput.pageNumber}) — AI confidence ${(lineInput.aiConfidence * 100).toFixed(0)}%.`,
          pageNumber: lineInput.pageNumber
        })
        flagBoundingBoxes.push(component.boundingBox)
      }
    }
    for (const flag of extraction.flags) {
      flagInputs.push({
        quotationLineId: null,
        origin: 'ai',
        severity: flag.severity,
        message: flag.message,
        pageNumber: flag.pageNumber
      })
      flagBoundingBoxes.push(flag.boundingBox)
    }
    if (flagInputs.length > 0) {
      const createdFlags = createFlags(quotation.id, flagInputs)
      createAiAnnotationsForFlags(sldId, createdFlags, flagBoundingBoxes)
    }
```

(`flagBoundingBoxes[i]` corresponds to `createdFlags[i]` because `createFlags` preserves input array order — same guarantee the original code already relied on implicitly.)

Add the import: `import type { AnnotationBoundingBox } from '@shared/types/entities'` (add to the existing `import type { Quotation, QuotationComment } from '@shared/types/entities'` line).

- [ ] **Step 3: Type-check** (after Task 6 also lands)

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/quotations.ipc.ts
git commit -m "feat: thread component/flag bounding boxes into AI annotation creation"
```

---

### Task 6: `annotationsRepo.ts` — rectangles instead of pins, theme color, bbox-aware creation

**Files:**
- Modify: `src/main/db/repositories/annotationsRepo.ts`
- Modify: `src/main/db/repositories/annotationsRepo.dbtest.ts`

**Interfaces:**
- Consumes: `AnnotationBoundingBox` (Task 1).
- Produces (consumed by Task 5): `createAiAnnotationsForFlags(sldId: string, flags: Flag[], boundingBoxes: (AnnotationBoundingBox | null)[]): void` (signature change — new second parameter, same array length/order as `flags`).
- Produces (consumed by Task 9 — `AnnotationCanvas.tsx`): AI annotations now have `shapeType: 'rectangle'` and `color: 'var(--color-accent)'`.

- [ ] **Step 1: Update the existing tests for the new shape/positioning, add new bbox-driven cases**

Replace the contents of `src/main/db/repositories/annotationsRepo.dbtest.ts`:

```ts
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { createFlags } from './flagsRepo'
import {
  createAiAnnotation,
  createAiAnnotationsForFlags,
  listAnnotationsBySld,
  resolveAiAnnotation,
  stackedFallbackBox
} from './annotationsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

function createProjectSldQuotation(): { sldId: string; quotationId: string } {
  const db = getDb()
  const now = new Date().toISOString()
  const projectId = randomUUID()
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    'Test Project',
    now,
    now
  )
  const sldId = randomUUID()
  db.prepare(
    'INSERT INTO slds (id, project_id, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sldId, projectId, 'test.pdf', now, now)
  const quotationId = randomUUID()
  db.prepare(
    `INSERT INTO quotations (id, sld_id, extraction_id, code, status, excel_file_path, created_at, updated_at)
     VALUES (?, ?, NULL, 'Q-TEST', 'pending_review', NULL, ?, ?)`
  ).run(quotationId, sldId, now, now)
  return { sldId, quotationId }
}

describe('stackedFallbackBox', () => {
  it('stacks fallback boxes downward with a fixed x anchor and a small fixed size', () => {
    const box0 = stackedFallbackBox(0)
    const box1 = stackedFallbackBox(1)
    expect(box0.x).toBe(0.03)
    expect(box0.y).toBeCloseTo(0.05)
    expect(box1.y).toBeCloseTo(0.11)
    expect(box0.width).toBeGreaterThan(0)
    expect(box0.height).toBeGreaterThan(0)
  })
})

describe('createAiAnnotation', () => {
  it('creates an ai-authored rectangle linked to a flag, using the theme accent color', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'Check this MCCB rating', pageNumber: 2 }
    ])

    const annotation = createAiAnnotation({
      sldId,
      pageNumber: 2,
      commentText: flag.message,
      linkedFlagId: flag.id,
      boundingBox: { x: 0.4, y: 0.3, width: 0.1, height: 0.05 }
    })

    expect(annotation.authorType).toBe('ai')
    expect(annotation.shapeType).toBe('rectangle')
    expect(annotation.color).toBe('var(--color-accent)')
    expect(annotation.linkedFlagId).toBe(flag.id)
    expect(annotation.resolvedAt).toBeNull()
    expect(annotation.points).toEqual([
      { x: 0.4, y: 0.3 },
      { x: 0.5, y: 0.35 }
    ])
  })

  it('falls back to a small fixed-size box at the given anchor when boundingBox is null', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [{ origin: 'ai', message: 'no box', pageNumber: 1 }])

    const annotation = createAiAnnotation({
      sldId,
      pageNumber: 1,
      commentText: flag.message,
      linkedFlagId: flag.id,
      boundingBox: null,
      fallbackIndexOnPage: 0
    })

    expect(annotation.points).toHaveLength(2)
    expect(annotation.points[0]).toEqual(stackedFallbackBox(0))
  })
})

describe('createAiAnnotationsForFlags', () => {
  it('creates annotations only for ai-origin flags, using each flag\'s paired bounding box', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [
      { origin: 'ai', message: 'AI flag with box', pageNumber: 1 },
      { origin: 'ai', message: 'AI flag without box', pageNumber: 1 },
      { origin: 'matcher', message: 'Unmatched item', pageNumber: 1 }
    ])
    const boundingBoxes = [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, null, null]

    createAiAnnotationsForFlags(sldId, flags, boundingBoxes)

    const annotations = listAnnotationsBySld(sldId)
    expect(annotations).toHaveLength(2)
    expect(annotations.every((a) => a.authorType === 'ai' && a.shapeType === 'rectangle')).toBe(
      true
    )
    const withBox = annotations.find((a) => a.linkedFlagId === flags[0].id)
    expect(withBox?.points[0]).toEqual({ x: 0.2, y: 0.2 })
    const withoutBox = annotations.find((a) => a.linkedFlagId === flags[1].id)
    expect(withoutBox?.points[0]).toEqual(stackedFallbackBox(0))
  })

  it('skips ai flags with no page number', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [{ origin: 'ai', message: 'No page', pageNumber: null }])

    createAiAnnotationsForFlags(sldId, flags, [null])

    expect(listAnnotationsBySld(sldId)).toHaveLength(0)
  })
})

describe('resolveAiAnnotation', () => {
  it('sets resolved_at on the annotation linked to a flag', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [{ origin: 'ai', message: 'msg', pageNumber: 1 }])
    createAiAnnotation({
      sldId,
      pageNumber: 1,
      commentText: flag.message,
      linkedFlagId: flag.id,
      boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }
    })

    resolveAiAnnotation(flag.id)

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.resolvedAt).not.toBeNull()
  })

  it('is a no-op when no annotation is linked to the flag', () => {
    expect(() => resolveAiAnnotation('nonexistent-flag-id')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db`
Expected: FAIL — old `stackedPinPosition`/pin-based API no longer matches; `createAiAnnotation` doesn't accept `boundingBox`/`fallbackIndexOnPage` yet.

- [ ] **Step 3: Implement the repository changes**

In `src/main/db/repositories/annotationsRepo.ts`, replace the AI-annotation section (everything from the `AI_ANNOTATION_COLOR`/`stackedPinPosition` constants down to the end of the file) with:

```ts
const AI_ANNOTATION_COLOR = 'var(--color-accent)'
const AI_BOX_ANCHOR_X = 0.03
const AI_BOX_BASE_Y = 0.05
const AI_BOX_STACK_STEP_Y = 0.06
const AI_BOX_FALLBACK_WIDTH = 0.1
const AI_BOX_FALLBACK_HEIGHT = 0.04

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
  linkedFlagId: string
  boundingBox: AnnotationBoundingBox | null
  /** Only used when boundingBox is null, to stack the fallback box. Defaults to 0. */
  fallbackIndexOnPage?: number
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
    color: AI_ANNOTATION_COLOR,
    stroke_width: 2,
    comment_text: input.commentText,
    created_at: new Date().toISOString(),
    linked_flag_id: input.linkedFlagId,
    resolved_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO annotations (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at, linked_flag_id, resolved_at)
       VALUES (@id, @sld_id, @page_number, @author_type, @shape_type, @path_data, @color, @stroke_width, @comment_text, @created_at, @linked_flag_id, @resolved_at)`
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
        boundingBox,
        fallbackIndexOnPage
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for flag', flag.id, err)
    }
  })
}

// Marks the box resolved rather than deleting it — the point is a permanent
// record of what the AI flagged and that a human addressed it, for later
// training-data use. No-op if the flag has no linked annotation (predates
// this feature, or isn't ai-origin).
export function resolveAiAnnotation(flagId: string): void {
  getDb()
    .prepare('UPDATE annotations SET resolved_at = ? WHERE linked_flag_id = ?')
    .run(new Date().toISOString(), flagId)
}
```

Update the top-of-file import to add `AnnotationBoundingBox`:

```ts
import type {
  Annotation,
  AnnotationBoundingBox,
  AnnotationPoint,
  CreateAnnotationInput,
  Flag
} from '@shared/types/entities'
```

(Everything above this section in the file — `toAnnotation`, `listAnnotationsBySldAndPage`, `listAnnotationsBySld`, `insertAnnotation`, `deleteAnnotation` — is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repositories/annotationsRepo.ts src/main/db/repositories/annotationsRepo.dbtest.ts
git commit -m "feat: AI annotations are theme-colored bounding-box rectangles, not stacked pins"
```

---

### Task 7: New IPC — list all annotations for an SLD (needed to resolve flag → page/annotation)

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/annotations.ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/state/queries/useAnnotations.ts`

**Interfaces:**
- Consumes: `listAnnotationsBySld` (existing repo function, already used internally by Task 6's tests — never previously exposed over IPC).
- Produces (consumed by Task 8 — `CenterPanel.tsx`): `useAnnotationsBySld(sldId: string | null): UseQueryResult<Annotation[]>`.

- [ ] **Step 1: Add the IPC channel**

In `src/shared/types/ipc-contract.ts`, add after `annotationsListBySldAndPage`:

```ts
  annotationsListBySld: 'annotations:listBySld',
```

- [ ] **Step 2: Register the handler**

In `src/main/ipc/annotations.ipc.ts`, add `listAnnotationsBySld` to the import from `../db/repositories/annotationsRepo`, and register it:

```ts
import {
  deleteAnnotation,
  insertAnnotation,
  listAnnotationsBySld,
  listAnnotationsBySldAndPage
} from '../db/repositories/annotationsRepo'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateAnnotationInput } from '@shared/types/entities'

export function registerAnnotationsIpc(): void {
  safeHandle(IPC.annotationsListBySldAndPage, (_event, sldId: string, pageNumber: number) =>
    listAnnotationsBySldAndPage(sldId, pageNumber)
  )

  safeHandle(IPC.annotationsListBySld, (_event, sldId: string) => listAnnotationsBySld(sldId))

  safeHandle(IPC.annotationsCreate, (_event, input: CreateAnnotationInput) =>
    insertAnnotation(input)
  )

  safeHandle(IPC.annotationsDelete, (_event, id: string) => deleteAnnotation(id))
}
```

- [ ] **Step 3: Update the preload API surface**

In `src/preload/index.ts`, add to the `annotations` block:

```ts
  annotations: {
    listBySldAndPage: (sldId: string, pageNumber: number): Promise<Annotation[]> =>
      ipcRenderer.invoke(IPC.annotationsListBySldAndPage, sldId, pageNumber),
    listBySld: (sldId: string): Promise<Annotation[]> =>
      ipcRenderer.invoke(IPC.annotationsListBySld, sldId),
    create: (input: CreateAnnotationInput): Promise<Annotation> =>
      ipcRenderer.invoke(IPC.annotationsCreate, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.annotationsDelete, id)
  },
```

- [ ] **Step 4: Add the renderer query hook**

In `src/renderer/src/state/queries/useAnnotations.ts`, add:

```ts
export function useAnnotationsBySld(sldId: string | null): UseQueryResult<Annotation[]> {
  return useQuery({
    queryKey: ['annotations-by-sld', sldId ?? ''],
    queryFn: () => window.api.annotations.listBySld(sldId as string),
    enabled: sldId !== null
  })
}
```

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/annotations.ipc.ts src/preload/index.ts src/renderer/src/state/queries/useAnnotations.ts
git commit -m "feat: expose listAnnotationsBySld over IPC for flag-to-annotation lookup"
```

---

### Task 8: `CenterPanel.tsx` — resolve a flag click into a page jump + highlight

**Files:**
- Modify: `src/renderer/src/components/layout/CenterPanel.tsx`

**Interfaces:**
- Consumes: `useAnnotationsBySld` (Task 7).
- Produces (consumed by Task 9 — `FlagsPanel.tsx`; Task 10 — `PdfViewer.tsx`): `CenterPanel` passes `onFocusFlag: (flagId: string) => void` to `FlagsPanel`, and `highlightedAnnotationId: string | null` to `PdfViewer`.

- [ ] **Step 1: Add highlight state and the flag-focus handler**

In `src/renderer/src/components/layout/CenterPanel.tsx`, add the import:

```ts
import { useAnnotationsBySld } from '@renderer/state/queries/useAnnotations'
```

Add, alongside the existing `focusPage` state (near `const [focusPage, setFocusPage] = useState<number | undefined>(undefined)`):

```ts
  const { data: sldAnnotations = [] } = useAnnotationsBySld(sld?.id ?? null)
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState<string | null>(null)

  const handleFocusFlag = (flagId: string): void => {
    const annotation = sldAnnotations.find((a) => a.linkedFlagId === flagId)
    if (!annotation) return
    setFocusPage(annotation.pageNumber)
    setHighlightedAnnotationId(annotation.id)
  }

  useEffect(() => {
    if (!highlightedAnnotationId) return
    const timeout = setTimeout(() => setHighlightedAnnotationId(null), 2500)
    return () => clearTimeout(timeout)
  }, [highlightedAnnotationId])
```

- [ ] **Step 2: Pass the new props down**

Change `<PdfViewer key={\`pdf-${sld.id}\`} sldId={sld.id} filename={sld.filename} focusPage={focusPage} />` to:

```tsx
            <PdfViewer
              key={`pdf-${sld.id}`}
              sldId={sld.id}
              filename={sld.filename}
              focusPage={focusPage}
              highlightedAnnotationId={highlightedAnnotationId}
            />
```

Change the `<FlagsPanel .../>` render (inside the `{quotation && (...)}` block) to add `onFocusFlag={handleFocusFlag}`:

```tsx
          <FlagsPanel
            open={flagsPanelOpen}
            onClose={() => setFlagsPanelOpen(false)}
            quotationId={quotation.id}
            sldId={sld.id}
            projectId={sld.projectId}
            lines={quotation.lines}
            onFocusFlag={handleFocusFlag}
          />
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `PdfViewer` and `FlagsPanel` don't accept these new props yet. Confirm failures are only in those two files; fixed in Tasks 9-10.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/CenterPanel.tsx
git commit -m "feat: wire flag-click-to-highlight lookup in CenterPanel"
```

---

### Task 9: `FlagsPanel.tsx` — "Show on drawing" affordance

**Files:**
- Modify: `src/renderer/src/components/quotation/FlagsPanel.tsx`

**Interfaces:**
- Consumes: `onFocusFlag` prop (Task 8).

- [ ] **Step 1: Accept the new prop**

Add `onFocusFlag` to `FlagsPanelProps` and the destructured props:

```ts
interface FlagsPanelProps {
  open: boolean
  onClose: () => void
  quotationId: string
  sldId: string
  projectId: string
  lines: QuotationLine[]
  onFocusFlag: (flagId: string) => void
}

export function FlagsPanel({
  open,
  onClose,
  quotationId,
  sldId,
  projectId,
  lines,
  onFocusFlag
}: FlagsPanelProps): React.JSX.Element {
```

- [ ] **Step 2: Add a "Show on drawing" button to each open flag card**

Add the `Crosshair` icon to the existing `lucide-react` import (`import { Loader2 } from 'lucide-react'` becomes `import { Crosshair, Loader2 } from 'lucide-react'`).

In the open-flags card (the `<div key={flag.id} ...>` block), add the button next to the page-number span:

```tsx
              <div className="flex items-center gap-2">
                <Badge tone={flagOriginMeta[flag.origin].tone}>
                  {flagOriginMeta[flag.origin].label}
                </Badge>
                <Badge tone={flagSeverityMeta[flag.severity].tone}>
                  {flagSeverityMeta[flag.severity].label}
                </Badge>
                {flag.pageNumber !== null && (
                  <span className="text-xs text-text-muted">Page {flag.pageNumber}</span>
                )}
                {flag.pageNumber !== null && (
                  <button
                    type="button"
                    onClick={() => onFocusFlag(flag.id)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
                    title="Show on drawing"
                  >
                    <Crosshair className="h-3 w-3" />
                    Show
                  </button>
                )}
              </div>
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `CenterPanel.tsx` already passes `onFocusFlag`, but `PdfViewer` still doesn't accept `highlightedAnnotationId` (Task 10). Confirm the only remaining failure is in `PdfViewer.tsx`/`AnnotationCanvas.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/quotation/FlagsPanel.tsx
git commit -m "feat: add \"Show on drawing\" button to jump to a flag's annotation"
```

---

### Task 10: `PdfViewer.tsx` / `AnnotationCanvas.tsx` — bounding-box rendering, theme color, highlight pulse

**Files:**
- Modify: `src/renderer/src/components/pdf/PdfViewer.tsx`
- Modify: `src/renderer/src/components/pdf/AnnotationCanvas.tsx`
- Modify: `src/renderer/src/styles/globals.css`

**Interfaces:**
- Consumes: `highlightedAnnotationId` (Task 8); `Annotation.shapeType === 'rectangle' && authorType === 'ai'` (Task 6).

- [ ] **Step 1: Add the highlight pulse animation**

In `src/renderer/src/styles/globals.css`, add (anywhere after the `:root` block):

```css
@keyframes ai-annotation-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(242, 101, 44, 0.6);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(242, 101, 44, 0);
  }
}

.ai-annotation-highlight {
  animation: ai-annotation-pulse 0.6s ease-out 3;
}
```

- [ ] **Step 2: Thread `highlightedAnnotationId` through `PdfViewer`**

In `src/renderer/src/components/pdf/PdfViewer.tsx`, modify `PdfViewerProps`:

```ts
interface PdfViewerProps {
  sldId: string
  filename: string
  focusPage?: number
  highlightedAnnotationId?: string | null
}
```

Modify the component signature:

```ts
export function PdfViewer({
  sldId,
  filename,
  focusPage,
  highlightedAnnotationId
}: PdfViewerProps): React.JSX.Element {
```

Pass it to `AnnotationCanvas` (in the JSX near the bottom, where `<AnnotationCanvas ... />` is rendered):

```tsx
          <AnnotationCanvas
            cssWidth={baseSize.width}
            cssHeight={baseSize.height}
            annotations={annotations}
            liveStroke={liveStroke}
            liveShape={liveShape}
            liveColor={color}
            liveStrokeWidth={strokeWidth}
            onMarkerClick={handleMarkerClick}
            highlightedAnnotationId={highlightedAnnotationId ?? null}
          />
```

- [ ] **Step 3: Exclude AI rectangles from the canvas-drawn path, add the new overlay rendering**

In `src/renderer/src/components/pdf/AnnotationCanvas.tsx`, add `highlightedAnnotationId` to the props:

```ts
interface AnnotationCanvasProps {
  cssWidth: number
  cssHeight: number
  annotations: Annotation[]
  liveStroke: AnnotationPoint[] | null
  liveShape: LiveShape | null
  liveColor: string
  liveStrokeWidth: number
  onMarkerClick: (annotation: Annotation) => void
  highlightedAnnotationId: string | null
}

export function AnnotationCanvas({
  cssWidth,
  cssHeight,
  annotations,
  liveStroke,
  liveShape,
  liveColor,
  liveStrokeWidth,
  onMarkerClick,
  highlightedAnnotationId
}: AnnotationCanvasProps): React.JSX.Element {
```

In the canvas-drawing `useEffect`, exclude AI-authored shapes from the shared canvas path (they're rendered as an HTML overlay instead — see below):

```ts
      } else if (
        (annotation.shapeType === 'circle' || annotation.shapeType === 'rectangle') &&
        annotation.points.length === 2 &&
        annotation.authorType !== 'ai'
      ) {
```

Add a new collection alongside the existing `pins`/`texts` filters:

```ts
  const pins = annotations.filter((a) => a.shapeType === 'pin' && a.points.length > 0)
  const texts = annotations.filter((a) => a.shapeType === 'text' && a.points.length > 0)
  const aiBoxes = annotations.filter(
    (a) => a.authorType === 'ai' && a.shapeType === 'rectangle' && a.points.length === 2
  )
```

Add the rendering block (after the `{pins.map(...)}` block, before `{texts.map(...)}`):

```tsx
      {aiBoxes.map((box) => {
        const [a, b] = box.points
        const left = Math.min(a.x, b.x) * 100
        const top = Math.min(a.y, b.y) * 100
        const width = Math.abs(b.x - a.x) * 100
        const height = Math.abs(b.y - a.y) * 100
        return (
          <button
            key={box.id}
            onClick={(e) => {
              e.stopPropagation()
              onMarkerClick(box)
            }}
            className={cn(
              'pointer-events-auto absolute rounded-sm border-2 bg-transparent',
              box.resolvedAt !== null && 'opacity-50',
              box.id === highlightedAnnotationId && 'ai-annotation-highlight'
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              borderColor: box.color
            }}
            title={box.commentText ?? ''}
          >
            <Sparkles
              className="absolute -left-1 -top-1 h-3 w-3 rounded-full p-0.5"
              style={{ backgroundColor: box.color, color: 'white' }}
            />
          </button>
        )
      })}
```

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/pdf/PdfViewer.tsx src/renderer/src/components/pdf/AnnotationCanvas.tsx src/renderer/src/styles/globals.css
git commit -m "feat: render AI annotations as theme-colored bounding boxes with click-to-highlight pulse"
```

---

### Task 11: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build and launch**

Run: `npm run dev` (kill any existing dev instance first — main-process changes require a restart).

- [ ] **Step 2: Verify bounding boxes**

In the throwaway `ZZ Stage3 Test Project`, run a fresh extraction (spends real tokens — use sparingly) or re-generate a quotation on an SLD with an existing successful extraction. Confirm:
- AI annotations render as orange (`--color-accent`) bordered rectangles, not circles/pins.
- A small Sparkles badge sits at each box's top-left corner.
- Boxes without a model-supplied bounding box still appear (small fixed-size fallback box, stacked if more than one lands on the same page).

- [ ] **Step 3: Verify click-to-highlight**

Open the Flags panel, click "Show" on an AI-origin flag with a page number. Confirm:
- The PDF viewer jumps to that flag's page.
- Its bounding box pulses (animated glow) for about 2 seconds, then settles back to its normal (non-highlighted) style.
- Clicking the box itself still does nothing (no delete, no dialog) — read-only, matching the existing non-goal.

- [ ] **Step 4: Verify resolve still dims correctly**

Resolve that same flag via "Confirm as-is" or "Add correction". Confirm the box dims (reduced opacity) but stays visible, exactly as the pin version did previously.

- [ ] **Step 5: Final check**

Run: `npm run test:all` and `npm run typecheck` one more time to confirm nothing regressed from manual testing.
