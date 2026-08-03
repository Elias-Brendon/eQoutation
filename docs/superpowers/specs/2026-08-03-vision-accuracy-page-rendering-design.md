# Vision Accuracy Improvement, Part 1: Pre-Rendered High-Resolution Page Images — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** User-reported real failures: misread numbers/ratings and components missed entirely during SLD extraction. This is part 1 of a 3-part roadmap agreed with the user:
1. **(this spec)** Pre-render PDF pages as controlled high-resolution images instead of relying on Anthropic's automatic PDF-to-image conversion.
2. Self-verification pass ("did you miss anything?") — a follow-up call against the same images plus the draft extraction.
3. Per-panel crop-and-zoom for dense multi-panel pages (stretch, only if 1+2 don't close the gap).

Cost tolerance confirmed with the user: a moderate per-extraction cost increase is acceptable in exchange for meaningfully better accuracy.

## Problem

`src/main/ai/ClaudeProvider.ts` currently sends the raw PDF as a single `document` content block (`source: { type: 'base64', media_type: 'application/pdf' }`). Anthropic's API rasterizes PDF pages to images internally, at a resolution eQuotation has no visibility into or control over. For dense engineering drawings with small text (ratings, tags), this is a plausible root cause for both reported failure modes: an under-resolved page can render small numerals illegible (misread ratings) or shrink a small symbol below the point where the model reliably notices it (missed components).

## Approach

Render each PDF page to a PNG image ourselves, at a controlled target resolution, and send those as explicit `image` content blocks instead of one `document` block.

### Resolution target

Render each page so its **long edge is 1568px** — a long-documented sweet spot across Claude's vision line; images larger than the model's effective input resolution get downscaled server-side regardless of what's sent, so rendering higher than this spends more input tokens (cost) for no legibility gain. This value lives as a named constant, not a magic number, so it's trivial to tune later based on real results.

**Explicit limitation, not being oversold:** this fixes cases where Anthropic's own automatic rasterization was under-resolving a page relative to what a controlled high-quality render can achieve. It does **not** raise Claude's fundamental effective-resolution ceiling — a physically dense sheet crammed with many small panels can still exceed what's legible even in a perfectly rendered 1568px-long-edge image. That's what part 3 (per-panel cropping) of the roadmap exists for; this part alone is expected to help, not to be a complete fix for every dense-drawing case.

### Rendering implementation

New dependency: **`@napi-rs/canvas`** — a Node-native `Canvas`/`CanvasRenderingContext2D` implementation shipping prebuilt binaries per platform (no `node-gyp`/native build toolchain required at install time, unlike `node-canvas`). Paired with the already-pinned `pdfjs-dist@4.10.38`'s Node-compatible entry point (`pdfjs-dist/legacy/build/pdf.mjs`), this lets the **main process** (which has no browser DOM/Canvas natively) rasterize PDF pages without routing rendering through the renderer process.

New module `src/main/ai/pdfRenderer.ts`:
- `computeRenderScale(pageWidthPt: number, pageHeightPt: number, targetLongEdgePx: number): number` — a **pure function** (no PDF/canvas dependency): returns the scale factor such that `max(pageWidthPt, pageHeightPt) * scale === targetLongEdgePx`. Fully unit-testable.
- `renderPdfPagesToImages(pdfBytes: Buffer): Promise<{ pageNumber: number; base64Png: string }[]>` — the actual pdfjs-dist decode + `@napi-rs/canvas` render loop, using `computeRenderScale` internally. Not unit tested directly (matches this codebase's convention: files wrapping native/IO-heavy external libraries — `ClaudeProvider.ts`, `frankfurterClient.ts`, every `ipc/*.ts` file — are live-verified, not mocked; this project has zero `vi.mock()` usage anywhere).

### `ClaudeProvider.ts` change

`extractComponents()`'s message content changes from one `document` block to N `image` blocks (one per page from `renderPdfPagesToImages`), each preceded by a `text` block reading `Page N` so the model can still correctly populate each component's/flag's `pageNumber` field without the explicit page-boundary information a PDF document block would otherwise carry. Progress reporting gains a `Rendering pages` stage (before `Sending to Claude`), since rasterizing several pages at high resolution is not instantaneous.

The system prompt (`promptTemplates.ts`)'s opening line ("Go through every page of the attached PDF...") gets a small wording adjustment to reflect that pages now arrive as separate labeled images rather than one PDF attachment — no rule/logic content changes, purely reflecting the new input shape.

### Packaging

`@napi-rs/canvas` ships native `.node` binaries as platform-specific optional dependencies — `electron-builder.yml`'s `asarUnpack` list needs `node_modules/@napi-rs/canvas/**/*` added, mirroring how `better-sqlite3` is already handled there. `npm run verify:installer` (already exists, from the beta-packaging initiative) should catch a packaging regression here if the unpack path is wrong, since it runs a real installed-app launch.

## Error handling

If page rendering fails (corrupt PDF, canvas allocation failure, etc.), extraction fails with a clear `AppError` rather than silently falling back to the old raw-PDF-document behavior — a silent quality regression would be worse than a visible failure the user can retry or report. No new error code needed if the existing `AI_REQUEST_FAILED`/`CAT_PARSE_FAILED`-style categorization already fits; the implementation plan should pick whichever existing code is the closest honest fit (or add one if none fits) rather than overloading an unrelated one.

## Verification

Automated: `computeRenderScale`'s unit tests, plus the full existing test suite (regression check — this touches a widely-used file).

**Live verification, by the user, is required and cannot be substituted:** re-run extraction on 1-2 of the actual SLDs where misreads/missed components were previously observed, before and after this change, and compare. This is a real accuracy question that no automated test in this codebase answers — the same category of limitation noted for the dynamic AI model list and TopBar UI checks earlier this session.

## Out of scope (this spec)

- The self-verification pass and per-panel cropping (parts 2 and 3 of the roadmap — separate specs if part 1 doesn't fully close the gap).
- Any change to the extraction JSON schema, confidence-scoring rubric, or business-logic rules in the prompt (breaker formatting, cable sizing tables, etc.) — untouched.
- Any change to which AI model is used or how it's selected (covered by the separate dynamic-AI-model-list feature).
- Exposing the render-resolution constant as a user-facing setting — it's a tunable code constant for now, not Settings UI; revisit only if empirical tuning turns out to need per-project variation.
