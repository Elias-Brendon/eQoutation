# AI-Authored Annotations — Design

## Context

Stage 10 of the original build plan called for two things: feedback logging (done, see `feedback_log`) and AI-authored PDF annotations — using the same `annotations` table and renderer a human uses (`author_type: 'ai'`), so the AI can visually flag things on the drawing itself, not just as text.

The `author_type` column has existed since migration `0003_annotations.ts`, but `annotationsRepo.ts`'s `createAnnotation` hardcodes `author_type: 'human'` — no code path has ever written an `'ai'` row. Meanwhile, `origin: 'ai'` flags already exist and carry a `pageNumber` (created in `quotations.ipc.ts` during quotation generation, from both low-confidence line items and raw `extraction.flags`), and the extraction panel already renders them as text cards with a "p1 …" prefix. They just never show up on the PDF itself.

This is roadmap item 2 (see `project_remaining_stages_roadmap`), next after AI usage governance.

## Goals

- Every `origin: 'ai'` flag raised during quotation generation gets a corresponding pin annotation on its SLD's PDF, visually distinct from human-made annotations.
- Resolving the flag removes its pin — the PDF stays clean of stale markers for issues already handled.
- No new AI/extraction-schema work: positions are derived from the page number the flag already carries, not from new spatial data the model would have to produce.

## Non-goals

- No backfill for the ~49 existing `origin: 'ai'` flags in already-extracted projects — this only applies to flags raised by extractions going forward. Existing flags keep behaving exactly as they do today (text cards only).
- No `origin: 'matcher'` pins — catalog-matching issues aren't AI observations on the drawing, so they stay text-only in the Flags panel, same as today.
- No AI-derived x/y coordinates. Pins land at a fixed stacked position per page, not near the actual flagged component.
- AI pins are not user-deletable. No undo/redo/clear-page interaction for them — those flows stay scoped to human-made annotations, as today.

## Design

### Data model (migration `0020_annotation_linked_flag.ts`)

```sql
ALTER TABLE annotations ADD COLUMN linked_flag_id TEXT REFERENCES flags(id) ON DELETE CASCADE;
```

Nullable — `NULL` for every existing (human) annotation. Only AI-authored annotations set this, linking the pin back to the flag that produced it.

### Creation: `quotations.ipc.ts`

In the quotation-generation handler, immediately after the existing `if (flagInputs.length > 0) createFlags(quotation.id, flagInputs)` call:

```ts
const createdFlags = flagInputs.length > 0 ? createFlags(quotation.id, flagInputs) : []
```

(`createFlags` already returns `Flag[]` with real ids — this just captures the return value instead of discarding it.)

For every created flag with `origin === 'ai'`, insert one annotation via a new `createAiAnnotation` in `annotationsRepo.ts`:

- `sldId`, `pageNumber: flag.pageNumber`
- `shapeType: 'pin'`
- `authorType: 'ai'`
- `commentText: flag.message`
- `linkedFlagId: flag.id`
- `color`: a reserved constant not in the human `ANNOTATION_COLORS` palette (e.g. `#a855f7`, purple)
- `points`: computed position (see below)

If `flag.pageNumber` is `null` (shouldn't happen for `'ai'`-origin flags given today's callers, but the type allows it), skip creating a pin for that flag — a flag with no page can't be placed on a page.

### Positioning

No x/y data exists per flag, so pins are placed at a fixed anchor and stacked when a page has more than one:

```ts
function stackedPinPosition(indexOnPage: number): AnnotationPoint {
  return { x: 0.03, y: 0.05 + 0.06 * indexOnPage }
}
```

`indexOnPage` is the 0-based count of AI pins already being created for that `pageNumber` within this same quotation-generation call (a project can regenerate a quotation, but each generation's flag batch is created together, so this is a simple in-memory counter over `createdFlags`, not a DB query).

### Lifecycle sync: resolving a flag removes its pin

In `flags.ipc.ts`'s resolve handler (backing `useResolveFlag`), after marking the flag resolved, delete any annotation row with `linked_flag_id = flagId`. Simplest implementation: rely on the migration's `ON DELETE CASCADE` if flags are ever hard-deleted (they aren't today — `resolveFlag` only updates `status`), so the resolve handler explicitly calls a new `deleteAnnotationsByFlagId(flagId)` in `annotationsRepo.ts`.

### Rendering: `AnnotationCanvas.tsx` / `PdfViewer.tsx`

- Pin rendering already branches on `shapeType === 'pin'`; add a branch on `authorType`:
  - `authorType === 'ai'`: use the reserved color (ignoring `pin.color` isn't needed since we already store the reserved color on the row) and swap the icon from `MessageCircle` to `Sparkles` (already imported elsewhere in the app for AI-generation UI, e.g. `TopBar.tsx`), so AI pins are recognizable at a glance.
  - `authorType === 'human'`: unchanged.
- `PdfViewer.tsx`'s `handleMarkerClick`: if `annotation.authorType === 'ai'`, return early (no `window.confirm`, no delete) — the hover `title` (already wired to `commentText`) is the only interaction. Human pins keep today's click-to-delete-with-confirm behavior.
- Undo/redo (`historyRef`/`redoRef` in `PdfViewer.tsx`) and "Clear annotations on this page" continue to operate only on annotations created through the human drawing tools — AI pins are simply never added to that history, since they're never created or deleted through those code paths.

### Types

- `Annotation` (`shared/types/entities.ts`) gains `linkedFlagId: string | null`.
- `CreateAnnotationInput` is unaffected (AI annotations aren't created through the existing human-facing `createAnnotation` IPC path — they go through the new internal `createAiAnnotation` called directly from `quotations.ipc.ts`).

## Error handling

- Annotation creation for AI flags is best-effort within the quotation-generation transaction: if a single `createAiAnnotation` call fails (shouldn't happen — no external I/O, just an insert), it should not roll back the whole quotation/flag creation. Wrap the per-flag annotation inserts in a try/catch that logs and continues, consistent with token-usage's "best-effort, never block the main outcome" precedent from the AI usage governance work.
- `deleteAnnotationsByFlagId` is a no-op (deletes zero rows) when no pin exists for that flag — e.g. flags from before this feature shipped, or `matcher`-origin flags. No error path needed.

## Testing

- `.dbtest.ts` (`annotationsRepo.dbtest.ts` or a new `quotationsRepo`-adjacent test): generating a quotation whose extraction has `origin: 'ai'` flags creates matching annotation rows with the right `page_number`, `author_type: 'ai'`, and `linked_flag_id`; `origin: 'matcher'` flags do not get annotations.
- Multiple AI flags on the same page get distinct stacked `y` positions (no two pins at the identical point).
- Resolving a flag deletes its linked annotation; resolving a flag with no linked annotation (e.g. a `matcher` flag) is a no-op, not an error.

## Verification

- `npm run test:all` passing, including the new cases above.
- Manual, in the throwaway test project: generate a quotation on an SLD whose extraction has AI flags, confirm distinct-colored pins with the Sparkles icon appear on the correct pages in `PdfViewer`, stacked if more than one lands on the same page. Hover shows the flag message. Click does nothing (no delete). Resolve one of those flags in the Flags panel and confirm its pin disappears from the PDF.
