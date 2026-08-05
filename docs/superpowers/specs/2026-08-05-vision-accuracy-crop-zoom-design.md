# Vision Accuracy Improvement, Part 3: Per-Panel Crop-and-Zoom — Design

**Date:** 2026-08-05
**Status:** Approved
**Context:** Part 3 of the 3-part vision accuracy roadmap (see `project_vision_accuracy_roadmap` memory). Parts 1 (rendered page images) and 2 (self-verification pass) shipped 2026-08-03/04. The user re-ran extraction on a real problematic SLD on 2026-08-05: no errors, but components were still missed outright — specifically the last MCCBs on page 4 were dropped entirely. That's an omission, not a misread, so parts 1+2 did not close the gap. Per the roadmap's own trigger condition, this is the signal for part 3.

## Problem

Parts 1+2 improve resolution and add a second look, but neither one solves the case of a physically dense sheet with many small panels crammed together, where even a well-rendered 1568px-long-edge page image can exceed Claude's effective legible resolution for the smallest elements. A component small enough to be illegible (or easy to overlook) at whole-page scale needs to be examined at a scale where it's actually clear — cropping into just its panel and re-rendering that region at high resolution.

## Approach

Extend the existing two-pass pipeline (`ClaudeProvider.extractComponents()`) to three passes:

1. **Draft** (existing, pass 1) — now also reports `panels`, not just `components`/`flags`.
2. **Verification** (existing, pass 2, unchanged in its own logic) — reviews the same page images + draft list, appends `missedComponents`/`additionalFlags`.
3. **Crop-zoom** (new, pass 3) — for every page with 1+ detected panels, re-renders each panel region from the original PDF at fresh high resolution, bundles all of that page's crops into one call for that page, and asks Claude to review them against the running (post-verification) list for anything genuinely missed.

Always runs, unconditionally, for every extraction — no density heuristic, no Settings toggle. Matches the pattern already set by part 2.

**Explicit limitation, stated up front:** this only helps components *inside* a panel region pass 1 actually detected as a panel. A component floating outside any dashed-box region, or a page where pass 1 never recognized a panel boundary at all, gets no zoom pass. A mis-located panel box produces a bad or missing crop — garbage in, garbage out on detection. This is not a complete fix for every dense-drawing failure mode, the same honest caveat parts 1 and 2 already carry.

## Schema changes (`extractionSchema.ts`)

Pass 1's draft schema gains a third top-level array:

```json
{
  "components": [...],
  "flags": [...],
  "panels": [
    { "pageNumber": 4, "panelName": "250A DB-G1", "boundingBox": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4 } }
  ]
}
```

`panels` reuses the existing `boundingBoxJsonSchema` (normalized 0-1, same as components/flags). New `buildPanelItemSchema()` factory joins `buildComponentItemSchema`/`buildFlagItemSchema`; new `normalizePanel(raw)` joins `normalizeComponent`/`normalizeFlag`. `normalizeExtractionPayload` now returns `{ components, flags, panels }` instead of `{ components, flags }`. `ExtractedPanel` is a new type in `@shared/types/entities` (`pageNumber`, `panelName`, `boundingBox`).

The verification pass (part 2) does not detect or re-detect panels — it only ever sees pass 1's `panels` list, unchanged. Its own schema and merge logic are otherwise untouched by this spec except for the dedup change described below.

## Rendering: cropped high-resolution panel images (`pdfRenderer.ts`)

New function: `renderPdfPanelCrop(pdfDoc, pageNumber, boundingBox, targetLongEdgePx): Promise<string>` (base64 PNG).

Naively re-rendering a small panel at high detail means rendering the *whole page* at a proportionally huge scale and discarding most of it — wasteful in memory and time. Instead:

1. Compute `cropScale` so the panel's longer physical dimension (`boundingBox`'s fraction × the page's point dimensions) maps to `targetLongEdgePx` — the same math `computeRenderScale` already does for whole pages, applied to the panel's size instead.
2. Allocate a canvas sized to *only* the crop's resulting pixel dimensions, not the full scaled page.
3. Use pdfjs's `page.render({ transform })` option to shift the render origin by `(-boundingBox.x * scaledPageWidth, -boundingBox.y * scaledPageHeight)`, so only the panel's content lands inside that small canvas. pdfjs still walks the full page's vector content internally, but only the crop-sized bitmap is ever materialized.

**Guardrails:**
- `MAX_CROP_LONG_EDGE_PX = 2400` (higher than the whole-page `TARGET_LONG_EDGE_PX = 1568`, since more detail is the point, but capped) clamps the computed `cropScale` so a tiny panel box can't demand an arbitrarily large render.
- A minimum box-size threshold — `boundingBox.width < 0.01 || boundingBox.height < 0.01` (fraction of page) — is treated as a malformed/degenerate panel box. That panel is skipped (logged via `console.error`, not thrown) rather than attempting a crop that could be near-zero-size or absurdly scaled.

`renderPdfPanelCrop` takes an already-loaded `pdfDoc` (not raw `pdfBytes`) so pass 3 can reuse the same document object `renderPdfPagesToImages` already loaded for pass 1, rather than re-parsing the PDF from bytes a third time.

## Prompt (`promptTemplates.ts`)

New `buildCropZoomSystemPrompt(enabledComponentTypes, catalogDescriptions, preferredBrands, customRules, pageComponents, pageFlags)`, structurally mirroring `buildVerificationSystemPrompt` — reuses the shared `buildExtractionRulesSection()`, not the full pass-1 prompt (same duplication fix part 2 already established). Response schema is the same `{ missedComponents, additionalFlags }` shape verification uses (`buildVerificationJsonSchema`, reused as-is — no new JSON schema needed for the response itself).

Call structure, one per page-with-panels: each panel crop image is preceded by a text block (`Page 4 — Panel: 250A DB-G1`) so Claude knows which region it's looking at; the prompt also includes that page's current components/flags (post-verification, compact form — description/tag/page/panel, same compact form part 2 already uses) so Claude has "don't repeat this" context as prompt-level defense in depth, on top of the code-level dedup below.

## Merge and dedup

**This spec also closes an existing gap, not just prevents a new one.** Part 2's merge into the draft currently has no code-level dedup — appending is prompt-only, an accepted risk at the time. Adding real dedup only for part 3's new merge while leaving part 2 as-is would mean two different merge behaviors for no good reason. Both merges now go through one shared function:

The geometric check is shared; the text-similarity check differs by shape (components have `tag`/`description`, flags only have `message`), so two thin wrappers share one geometric core:

```ts
function boundingBoxesLikelyMatch(a: AnnotationBoundingBox | null, b: AnnotationBoundingBox | null): boolean
// IoU >= DEDUP_IOU_THRESHOLD (0.3); if either box is null, falls back to
// center-distance <= DEDUP_CENTER_DISTANCE (0.05, normalized page coords)

function dedupeComponents(existing: ExtractedComponent[], candidates: ExtractedComponent[]): ExtractedComponent[]
// drops a candidate when some existing component has the same pageNumber,
// boundingBoxesLikelyMatch(...), and either tag matches case-insensitively
// (both non-empty) or, failing that, normalized (trim + lowercase) description matches

function dedupeFlags(existing: ExtractionFlag[], candidates: ExtractionFlag[]): ExtractionFlag[]
// same pageNumber + boundingBoxesLikelyMatch(...), text check compares
// normalized (trim + lowercase) `message` instead of tag/description
```

Both threshold constants are named, not inlined, so they're trivial to retune after live verification — same convention as `TARGET_LONG_EDGE_PX`. All three functions are pure and fully unit-testable, same pattern as `computeRenderScale`.

`ClaudeProvider.extractComponents()`'s existing verification-merge (`components.push(...missedComponents)`) becomes `components.push(...dedupeComponents(components, missedComponents))`, and `flags.push(...additionalFlags)` becomes `flags.push(...dedupeFlags(flags, additionalFlags))`. Pass 3's merge uses the identical functions against the by-then-merged lists.

## Error handling

Crop-zoom is an accuracy enhancement, not a hard requirement — a failure here must never fail or degrade an already-successful extraction. Per-page: if a page's crop-zoom call throws (network, malformed JSON, rate limit, render setup failure), it's caught, logged (`console.error('[ai:cropZoomExtraction]', ...)`, matching the existing non-fatal pattern used by verification), and that page simply contributes nothing extra — the draft+verification result for that page stands as-is. Per-panel: if an individual panel's crop render fails (degenerate geometry, canvas allocation failure), that panel is skipped and logged; the page's other panels still proceed.

## Cost and progress

- A new `Zooming into panels` progress stage between the existing `Verifying` and `Done` stages.
- Token usage from every per-page crop-zoom call accumulates into the same `usage` total `extractComponents` already returns — no changes needed to existing cost-tracking (TopBar badge, `ProjectTokenUsage`).
- **Cost impact, stated plainly:** parts 1+2 already roughly doubled the pre-roadmap baseline cost. Part 3 adds a further call per page that has detected panels, sized by how many panels that page has (bundled per page, not per panel, per the earlier scope decision) — a dense multi-panel SLD costs more to extract than a simple single-panel one. Always-run means every extraction pays this, not just ones flagged as dense.

## Testing

- Unit tests: crop-scale math (mirroring `computeRenderScale`'s existing test coverage), `boundingBoxesLikelyMatch`, and the text-similarity checks inside `dedupeComponents`/`dedupeFlags`.
- `@napi-rs/canvas`/pdfjs rendering itself and the live Anthropic API calls remain live-verified only, consistent with this codebase's existing convention (`ClaudeProvider.ts`, `pdfRenderer.ts`, and every `ipc/*.ts` file are exercised live, not mocked — this project has zero `vi.mock()` usage).
- Full existing test suite as a regression check, since this touches `extractionSchema.ts` and `ClaudeProvider.ts` broadly.

**Live verification, by the user, is required and cannot be substituted:** re-run extraction on the same real SLD where page 4's MCCBs were missed (and ideally 1-2 other previously-problematic ones) and confirm those components now appear. Also specifically check for new duplicates — the crop-zoom pass is a second new source of components on top of verification, so even with code-level dedup in place, real-world confirmation that dedup is actually catching what it should is not something an automated test can substitute for.

## Out of scope

- Any Settings toggle to disable crop-zoom or make it conditional on page density.
- Any visual UI distinction between which pass (draft/verification/crop-zoom) found a given component or flag — they merge in as ordinary components/flags, indistinguishable to a reviewer, same as part 2's existing scope decision.
- Correcting a mis-located or entirely undetected panel boundary — pass 3 trusts pass 1's `panels` list as given.
- Any change to `AIProvider`'s public interface or `ai.ipc.ts`'s orchestration — like part 2, this stays fully internal to `ClaudeProvider.extractComponents()`.
- Re-rendering whole pages at a higher `TARGET_LONG_EDGE_PX` — that's part 1's territory and was already tuned; this spec only adds a *targeted* higher-resolution render for detected panel regions.
