# Vision Accuracy Improvement, Part 2: Self-Verification Pass — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** Part 2 of the 3-part vision accuracy roadmap (see `project_vision_accuracy_roadmap` memory). Part 1 (rendered page images, `docs/superpowers/specs/2026-08-03-vision-accuracy-page-rendering-design.md`) shipped earlier the same day; this part proceeds without waiting for the user's real-SLD verification of part 1, per explicit instruction.

## Goal

Catch components visible on a drawing but missing from the draft extraction, and ratings that look internally inconsistent, via a second Claude call against the same rendered page images plus the draft result — targeting the "missed entirely" failure mode in a way that better resolution alone (part 1) doesn't fully solve, since some misses are attention/thoroughness gaps rather than resolution gaps.

## Where it lives

Entirely inside `ClaudeProvider.extractComponents()`, as a second internal call made after the existing (pass 1) draft extraction succeeds. `AIProvider`'s public interface and `ExtractionResult` type are unchanged — verification is an implementation detail of what "extraction" now means, not a new orchestration step in `ai.ipc.ts`. This also means the existing per-attempt retry loop in `ai.ipc.ts` (`maxExtractionRetries`) naturally covers both calls together without any changes there.

The second call reuses the exact same rendered page images (`pages`, from part 1's `renderPdfPagesToImages`) already computed for pass 1 — no re-rendering the PDF.

## Response shape and merge strategy

A new, smaller JSON schema for the verification response:

```json
{
  "missedComponents": [ /* same component item schema as the draft extraction */ ],
  "additionalFlags": [ /* same flag item schema as the draft extraction */ ]
}
```

These get **appended** to the draft's `components`/`flags` arrays — never replacing, editing, or removing anything pass 1 already produced. This is deliberate: verification can only add what it thinks was missed, keeping its blast radius contained to the specific failure mode it targets, and avoiding any risk of a second pass silently "fixing" (i.e., breaking) something pass 1 got right.

**Refactor to support this without duplication:** `extractionSchema.ts`'s component-item and flag-item JSON schemas are currently inlined once inside `buildExtractionJsonSchema`. Both get extracted into their own small functions (`buildComponentItemSchema(enabledComponentTypes)`, `buildFlagItemSchema()`) so the new verification schema function reuses them instead of duplicating ~50 lines. Similarly, `normalizeExtractionPayload`'s per-component and per-flag normalization logic (currently inlined in `.map()` callbacks) get extracted into `normalizeComponent(raw)`/`normalizeFlag(raw)` functions, reused by both the draft-parsing path and the new verification-parsing path.

## Prompt

New `buildVerificationSystemPrompt(draftComponents, draftFlags)` in `promptTemplates.ts`. Serializes the draft's components/flags list into the prompt (compact form: description, tag, page, panel — not the full object) and instructs Claude to review the same page images specifically for:
1. Any component visible in an image but absent from the provided list (add it as a `missedComponents` entry, following the same description/formatting rules as the main extraction prompt — same breaker formatting, cable-sizing rules, etc., since a missed component still needs to follow all the business rules already established).
2. Any rating in the provided list that looks internally inconsistent with what's shown (e.g., a cable size noted that doesn't match a stated busbar/cable choice) — raised as an `additionalFlags` entry, not a silent edit, since the draft's own text is never modified by this pass.

This reuses the same recognized-types/business-rule content as `buildExtractionSystemPrompt` (breaker formatting, cable tables, etc.) rather than re-deriving it — the underlying rules for what a correctly-described component looks like don't change between the two passes, only the task framing does.

## Failure handling

If the verification call itself fails (network error, malformed response, rate limit, etc.), it's caught, logged (`console.error`, matching this file's existing non-fatal-issue pattern — not a fresh `AppError`, since this must not fail the overall extraction), and `extractComponents` returns the draft-only result exactly as if verification had found nothing to add. Per the earlier decision: a failed enhancement pass shouldn't waste an already-successful first pass or force a costly full retry.

## Cost and progress

- The verification call's token usage is added to the same `usage` object `extractComponents` already returns, so per-project cost tracking (already built, TopBar badge + `ProjectTokenUsage`) reflects both calls without any changes to that system.
- A new `Verifying` progress stage is reported between the existing `Parsing response` and `Done` stages.
- Always runs, no Settings toggle — matches the roadmap's already-agreed cost tolerance.

## Out of scope

- Any visual distinction in the UI between pass-1 and verification-added components/flags — they merge in as ordinary components/flags, indistinguishable to a reviewer. Revisit only if real usage shows this distinction is actually needed.
- Any change to `AIProvider`'s interface, `ExtractionResult`'s shape, or `ai.ipc.ts`'s orchestration — verification is fully internal to `ClaudeProvider`.
- A user-facing setting to disable verification.
- Re-rendering pages at a different resolution for the verification pass — reuses the exact same images as pass 1.
