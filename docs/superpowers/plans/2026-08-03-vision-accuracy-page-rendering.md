# Vision Accuracy Improvement, Part 1: Pre-Rendered High-Resolution Page Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-PDF `document` content block sent to Claude with explicit, controlled high-resolution `image` blocks (one per page), so extraction accuracy no longer depends on Anthropic's opaque internal PDF rasterization.

**Architecture:** A new `src/main/ai/pdfRenderer.ts` module decodes the PDF with `pdfjs-dist`'s Node-compatible build and rasterizes each page via `@napi-rs/canvas` (a prebuilt-binary Node canvas implementation) to a PNG sized so its long edge hits a tunable target (1568px). `ClaudeProvider.ts`'s `extractComponents()` calls this instead of base64-encoding the raw PDF, and sends N labeled `image` blocks instead of one `document` block.

**Tech Stack:** `pdfjs-dist@4.10.38` (already pinned, Node-compatible `legacy/build/pdf.mjs` entry point), new dependency `@napi-rs/canvas`, existing `@anthropic-ai/sdk` message content-block types.

## Global Constraints

- Target render resolution: long edge = **1568px** (named constant, not inline) — larger wastes input tokens since Claude downscales server-side anyway. Source: spec, "Resolution target."
- This is an accuracy improvement, not a resolution ceiling fix — a physically dense multi-panel sheet may still exceed legible detail even at this resolution; that's out of scope here (roadmap part 3, if needed). Source: spec, "Explicit limitation."
- No fallback to the old raw-PDF-document behavior on render failure — fail with a clear `AppError` instead of silently degrading quality. Source: spec, "Error handling."
- No change to the extraction JSON schema, confidence rubric, or business-logic prompt rules (breaker formatting, cable tables, etc.) — only the input delivery mechanism and the opening prompt line describing it. Source: spec, "Out of scope."
- `renderPdfPagesToImages` (the actual pdfjs-dist + canvas render loop) has no automated test — matches this codebase's convention that files wrapping native/IO-heavy external libraries are live-verified, not unit tested. Only the pure scale-computation function is unit tested. Source: spec, "Rendering implementation."

---

### Task 1: Dependency, error code, and pure scale-computation function (TDD)

**Files:**
- Modify: `package.json`
- Modify: `src/shared/errors/errorCodes.ts`
- Create: `src/main/ai/pdfRenderer.ts` (scale function only in this task — the render function is Task 2)
- Test: `src/main/ai/pdfRenderer.test.ts`

**Interfaces:**
- Produces: `computeRenderScale(pageWidthPt: number, pageHeightPt: number, targetLongEdgePx: number): number` — consumed by Task 2's `renderPdfPagesToImages`. `AI_PAGE_RENDER_FAILED` error key — consumed by Task 2/3's error handling.

- [ ] **Step 1: Install the dependency**

```bash
npm install @napi-rs/canvas
```

Expected: `package.json`'s `"dependencies"` gains `"@napi-rs/canvas": "^..."` (alongside `pdfjs-dist`, `pdf-lib`, etc. — it's a runtime dependency, not a devDependency, since the packaged app needs it).

- [ ] **Step 2: Add the error code**

In `src/shared/errors/errorCodes.ts`, add after `AI_ALREADY_EXTRACTED: { code: 'AI-009', ... }`:

```typescript
  AI_PAGE_RENDER_FAILED: { code: 'AI-010', message: 'Could not render PDF pages for extraction' },
```

- [ ] **Step 3: Write the failing test**

`src/main/ai/pdfRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeRenderScale } from './pdfRenderer'

describe('computeRenderScale', () => {
  it('scales a portrait page so its height (the long edge) hits the target', () => {
    // A4 portrait in PDF points: 595 x 842
    const scale = computeRenderScale(595, 842, 1568)
    expect(scale).toBeCloseTo(1568 / 842, 5)
  })

  it('scales a landscape page so its width (the long edge) hits the target', () => {
    // A4 landscape: 842 x 595
    const scale = computeRenderScale(842, 595, 1568)
    expect(scale).toBeCloseTo(1568 / 842, 5)
  })

  it('scales a square page consistently off either dimension', () => {
    const scale = computeRenderScale(1000, 1000, 1568)
    expect(scale).toBeCloseTo(1.568, 5)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test -- pdfRenderer`
Expected: FAIL — `Cannot find module './pdfRenderer'`.

- [ ] **Step 5: Implement the scale function**

`src/main/ai/pdfRenderer.ts`:

```typescript
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- pdfRenderer`
Expected: PASS (3 new tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/shared/errors/errorCodes.ts src/main/ai/pdfRenderer.ts src/main/ai/pdfRenderer.test.ts
git commit -m "feat: add @napi-rs/canvas dependency and pure page-render-scale calculation"
```

---

### Task 2: Render PDF pages to PNG images (live-verified)

**Files:**
- Modify: `src/main/ai/pdfRenderer.ts`

**Interfaces:**
- Consumes: `computeRenderScale`, `TARGET_LONG_EDGE_PX` from Task 1.
- Produces: `renderPdfPagesToImages(pdfBytes: Uint8Array): Promise<{ pageNumber: number; base64Png: string }[]>` — consumed by Task 3's `ClaudeProvider.ts`.

- [ ] **Step 1: Implement the render function**

Add to `src/main/ai/pdfRenderer.ts` (below the existing `computeRenderScale`):

```typescript
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'

export async function renderPdfPagesToImages(
  pdfBytes: Uint8Array
): Promise<{ pageNumber: number; base64Png: string }[]> {
  const loadingTask = getDocument({ data: pdfBytes, disableWorker: true })
  const pdfDoc = await loadingTask.promise

  const pages: { pageNumber: number; base64Png: string }[] = []
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = computeRenderScale(baseViewport.width, baseViewport.height, TARGET_LONG_EDGE_PX)
    const viewport = page.getViewport({ scale })

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport })
      .promise

    pages.push({ pageNumber, base64Png: canvas.toBuffer('image/png').toString('base64') })
  }

  await pdfDoc.destroy()
  return pages
}
```

- [ ] **Step 2: Verify it actually renders a real SLD PDF**

This is genuinely new territory for this codebase (first time `pdfjs-dist` runs outside a browser context here) — the exact `pdfjs-dist`/`@napi-rs/canvas` integration may need adjustment once run for real. Write a throwaway script to check it end-to-end before wiring it into the extraction flow:

```bash
node -e "
const { renderPdfPagesToImages } = require('./src/main/ai/pdfRenderer.ts');
" 2>&1
```

Since the file is TypeScript, instead run it through the project's existing Electron/Node-compat test runner as a quick manual check — create a temporary throwaway test file `src/main/ai/pdfRenderer.manual.test.ts` (delete it at the end of this step, it is not part of the plan's deliverable) that loads a real SLD PDF from disk and asserts on the output shape:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { renderPdfPagesToImages } from './pdfRenderer'

describe('renderPdfPagesToImages (manual, real PDF)', () => {
  it('renders a real SLD PDF to PNG pages', async () => {
    // Replace with a real path to one of your actual SLD PDFs before running.
    const bytes = readFileSync('PATH_TO_A_REAL_SLD.pdf')
    const pages = await renderPdfPagesToImages(new Uint8Array(bytes))
    expect(pages.length).toBeGreaterThan(0)
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].base64Png.length).toBeGreaterThan(1000)
  })
})
```

Run: `npm run test -- pdfRenderer.manual`

If this throws (missing worker, missing canvas factory, `DOMMatrix is not defined`, or similar), the two most common fixes for this exact integration are, in order of likelihood:
- Missing global `DOMMatrix`/`Path2D`/`ImageData` that `pdfjs-dist` expects even in Node — `@napi-rs/canvas` exports these; assign them onto `global` before calling `getDocument` (e.g. `import { DOMMatrix } from '@napi-rs/canvas'; (global as any).DOMMatrix = DOMMatrix`, and similarly for any other constructor the thrown error names).
- `page.render()` complaining about a missing `canvasFactory` — pass one explicitly per pdfjs-dist's Node examples, backed by `@napi-rs/canvas`'s `createCanvas`.

Iterate on `src/main/ai/pdfRenderer.ts` until the manual test passes with a real PDF, then delete `src/main/ai/pdfRenderer.manual.test.ts` (it referenced a real file path and was only a debugging aid, not a permanent test).

- [ ] **Step 3: Run the existing pdfRenderer tests to confirm no regression**

Run: `npm run test -- pdfRenderer`
Expected: PASS (still 3 tests — the manual test file is gone).

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/pdfRenderer.ts
git commit -m "feat: render PDF pages to PNG images via pdfjs-dist + @napi-rs/canvas"
```

---

### Task 3: Wire rendered images into the Claude extraction call

**Files:**
- Modify: `src/main/ai/ClaudeProvider.ts`
- Modify: `src/main/ai/promptTemplates.ts`

**Interfaces:**
- Consumes: `renderPdfPagesToImages` from Task 2.

- [ ] **Step 1: Update `extractComponents` to render and send images**

In `src/main/ai/ClaudeProvider.ts`, add the import:

```typescript
import { renderPdfPagesToImages } from './pdfRenderer'
```

Replace the start of `extractComponents` (from `onProgress?.({ pct: 5, stage: 'Reading PDF' })` through the `messages: [...]` array) with:

```typescript
    onProgress?.({ pct: 5, stage: 'Reading PDF' })

    onProgress?.({ pct: 10, stage: 'Rendering pages' })
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pages = await renderPdfPagesToImages(pdfBytes)
    } catch (error) {
      console.error('[ai:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }

    onProgress?.({ pct: 15, stage: 'Sending to Claude' })

    let pct = 20
    const ticker = setInterval(() => {
      pct = Math.min(PROGRESS_TICK_CAP, pct + 3)
      onProgress?.({ pct, stage: 'Analyzing diagram' })
    }, PROGRESS_TICK_MS)

    const pageContentBlocks = pages.flatMap(
      (page): Anthropic.Messages.ContentBlockParam[] => [
        { type: 'text', text: `Page ${page.pageNumber}` },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: page.base64Png }
        }
      ]
    )

    let message: Anthropic.Messages.Message
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        // Extended thinking is on by default for this model and, left
        // unbounded, consumes the entire token budget before any structured
        // output is emitted. This task needs the budget spent on output.
        thinking: { type: 'disabled' },
        system: buildExtractionSystemPrompt(
          enabledComponentTypes,
          catalogDescriptions,
          preferredBrands,
          customRules
        ),
        messages: [
          {
            role: 'user',
            content: [
              ...pageContentBlocks,
              {
                type: 'text',
                text: 'Extract every component from this switchboard SLD as described in the system prompt.'
              }
            ]
          }
        ],
        output_config: {
          format: { type: 'json_schema', schema: buildExtractionJsonSchema(enabledComponentTypes) }
        }
      })
      message = await stream.finalMessage()
    } catch (error) {
```

(The `filename` parameter of `ExtractParams` is no longer used for a `document` block's `title` — it stays unused in this function going forward; do not remove it from `ExtractParams` itself, since `AIProvider`'s interface is shared and out of scope for this change.)

- [ ] **Step 2: Update the opening prompt line**

In `src/main/ai/promptTemplates.ts`, change:

```typescript
  return `You are a BOM-extraction agent for a low-voltage switchboard manufacturer,
reading Single Line Diagrams (SLDs) to build a bill of materials for a
quotation.

Go through every page of the attached PDF. A single page may contain
multiple panels — process every one.
```

to:

```typescript
  return `You are a BOM-extraction agent for a low-voltage switchboard manufacturer,
reading Single Line Diagrams (SLDs) to build a bill of materials for a
quotation.

Go through every page image below, in order (each is labeled "Page N"
immediately before it). A single page may contain multiple panels —
process every one.
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/ClaudeProvider.ts src/main/ai/promptTemplates.ts
git commit -m "feat: send rendered page images instead of a raw PDF document to Claude"
```

---

### Task 4: Packaging, full regression check, and live verification

**Files:**
- Modify: `electron-builder.yml`

**Interfaces:**
- Consumes: everything from Tasks 1–3.

- [ ] **Step 1: Unpack the new native dependency from the asar archive**

In `electron-builder.yml`, add to the `asarUnpack` list (alongside the existing `better-sqlite3` entries):

```yaml
asarUnpack:
  - resources/**
  - '**/*.node'
  - node_modules/better-sqlite3/**/*
  - node_modules/bindings/**/*
  - node_modules/file-uri-to-path/**/*
  - node_modules/@napi-rs/canvas/**/*
```

(`'**/*.node'` already unpacks any native binary by extension, but the explicit path — matching the existing `better-sqlite3` entries — makes the intent unambiguous and matches this file's established style.)

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npm run test:all && npm run typecheck`
Expected: both PASS.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new errors introduced by this plan's files (pre-existing repo-wide warnings are expected and unrelated).

- [ ] **Step 4: Live-verify a real extraction**

Start the app (`npm run dev`), then run a real extraction on an SLD PDF. Confirm:
- The progress bar shows a "Rendering pages" stage before "Sending to Claude."
- Extraction completes successfully and produces a normal-looking BOM.
- Token usage (visible in the TopBar/ExtractionPanel) looks reasonable — image-based input costs more input tokens than the previous raw-PDF approach; a large jump beyond what's explainable by page count/resolution would indicate something is wrong (e.g. rendering at a larger size than intended).

- [ ] **Step 5: Live-verify the actual accuracy improvement (the point of this whole plan)**

Using 1–2 of the actual SLDs where misreads or missed components were previously observed, re-run extraction and compare against what was seen before this change. This is the real success criterion for this plan — no automated test can substitute for it. Report back whether the specific previously-wrong readings are now correct.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: unpack @napi-rs/canvas from the asar archive"
```
