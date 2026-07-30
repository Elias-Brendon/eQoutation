# AI-Authored Annotations — Design

## Context

Stage 10 of the original build plan called for two things: feedback logging (done, see `feedback_log`) and AI-authored PDF annotations — using the same `annotations` table and renderer a human uses (`author_type: 'ai'`), so the AI can visually flag things on the drawing itself, not just as text.

The `author_type` column has existed since migration `0003_annotations.ts`, but `annotationsRepo.ts`'s `createAnnotation` hardcodes `author_type: 'human'` — no code path has ever written an `'ai'` row. Meanwhile, `origin: 'ai'` flags already exist and carry a `pageNumber` (created in `quotations.ipc.ts` during quotation generation, from both low-confidence line items and raw `extraction.flags`), and the extraction panel already renders them as text cards. They just never show up on the PDF itself.

**The actual purpose of this feature is data collection, not just review UX**: the goal is to build a durable corpus of "what the AI flagged" paired with "what a human ultimately decided," so that corpus can later be used to expand extraction rules and, eventually, train a local model (per the standing "reinforced training" intent from the original plan and the separate 2026-07-29 "training-data collection" roadmap item). That reframes several decisions below relative to a pure-UX read of Stage 10.

This is roadmap item 2 (see `project_remaining_stages_roadmap`), next after AI usage governance.

### Existing gap in the training-data path

`feedback_log` (migration `0011_confidence_feedback.ts`) already records structured AI-value-vs-human-value corrections, but only for flags tied to a specific quotation line (`quotation_line_id TEXT NOT NULL`) — populated via the Confidence Resolve Drawer (`IPC.feedbackResolveLine`). Raw extraction-level `origin: 'ai'` flags (page-level observations like "MSB panel name found; confirm busbar/cable choice", with `quotationLineId: null`) resolve today through a plain `FlagsPanel` "Resolve" button (`IPC.flagsResolve`) that only captures a free-text `resolutionNote` — no structured outcome. This feature closes that gap as part of making both flag categories usable as training data.

## Goals

- Every `origin: 'ai'` flag raised during quotation generation gets a corresponding pin annotation on its SLD's PDF, visually distinct from human-made annotations.
- Annotations are a **permanent record**: resolving the linked flag marks the annotation resolved (dimmed) rather than deleting it, so the pair (what the AI flagged + what the human ultimately decided) survives.
- Every `origin: 'ai'` flag resolution — line-level or page-level — produces a structured `feedback_log` entry, closing the gap described above.
- No new AI/extraction-schema work: pin positions are derived from the page number the flag already carries, not from new spatial data the model would have to produce.

## Non-goals

- No backfill for the ~49 existing `origin: 'ai'` flags in already-extracted projects — this only applies to flags raised by extractions going forward. Existing flags keep behaving exactly as they do today.
- No `origin: 'matcher'` or `origin: 'human'` pins, and no change to how those flags resolve — catalog-matching and human-raised issues aren't AI observations on the drawing, so they stay exactly as they are today (text-only, plain resolve, no `feedback_log` entry).
- No AI-derived x/y coordinates. Pins land at a fixed stacked position per page, not near the actual flagged component.
- AI pins are not user-deletable, and never enter the human undo/redo or "Clear annotations on this page" flows.
- No export/training pipeline. This spec produces and preserves the data (`annotations` + `feedback_log`); consuming it to expand rules or train a model is the separate training-data-collection roadmap item.

## Design

### Data model

**Migration `0020_annotation_ai_metadata.ts`:**

```sql
ALTER TABLE annotations ADD COLUMN linked_flag_id TEXT REFERENCES flags(id) ON DELETE CASCADE;
ALTER TABLE annotations ADD COLUMN resolved_at TEXT;
```

Both nullable — `NULL` for every existing (human) annotation. Only AI-authored annotations set `linked_flag_id`; `resolved_at` is set when that flag is resolved, never before.

**Migration `0021_feedback_log_flag_support.ts`** (SQLite table rebuild — no `ALTER COLUMN`, following the precedent in `0010_annotation_shapes.ts`):

```sql
CREATE TABLE feedback_log_new (
  id TEXT PRIMARY KEY,
  quotation_line_id TEXT REFERENCES quotation_lines(id) ON DELETE CASCADE,
  flag_id TEXT REFERENCES flags(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  ai_value TEXT NOT NULL,
  human_value TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted','corrected','flagged_for_later')),
  note TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO feedback_log_new
  (id, quotation_line_id, flag_id, field_changed, ai_value, human_value, action, note, created_at)
  SELECT id, quotation_line_id, NULL, field_changed, ai_value, human_value, action, note, created_at
  FROM feedback_log;

DROP TABLE feedback_log;
ALTER TABLE feedback_log_new RENAME TO feedback_log;

CREATE INDEX idx_feedback_log_line_id ON feedback_log(quotation_line_id);
CREATE INDEX idx_feedback_log_flag_id ON feedback_log(flag_id);
```

`quotation_line_id` becomes nullable; `flag_id` is new and nullable. Existing rows (all line-level) get `flag_id = NULL` — they were never linked to a flag before, and nothing in this feature needs to backfill that link retroactively (non-goal, matches the "no backfill" decision above). Every row still has at least one of the two FKs populated in practice (line-level rows keep `quotation_line_id`; new page-level rows set `flag_id` instead), but this isn't worth a CHECK constraint — no code path produces a row with both null.

### Creation: `quotations.ipc.ts`

In the quotation-generation handler, capture the return value of the existing flag-creation call instead of discarding it:

```ts
const createdFlags = flagInputs.length > 0 ? createFlags(quotation.id, flagInputs) : []
```

For every created flag with `origin === 'ai'` and a non-null `pageNumber`, insert one annotation via a new `createAiAnnotation` in `annotationsRepo.ts`: `sldId`, `pageNumber: flag.pageNumber`, `shapeType: 'pin'`, `authorType: 'ai'`, `commentText: flag.message`, `linkedFlagId: flag.id`, `color` = a reserved constant not in the human `ANNOTATION_COLORS` palette (`#a855f7`, purple), `points` = computed stacked position.

### Positioning

```ts
function stackedPinPosition(indexOnPage: number): AnnotationPoint {
  return { x: 0.03, y: 0.05 + 0.06 * indexOnPage }
}
```

`indexOnPage` is the 0-based count of AI pins already being created for that `pageNumber` within this same quotation-generation call (an in-memory counter over `createdFlags`, not a DB query).

### Resolution: two paths, both now produce `feedback_log` + mark the annotation resolved

**Line-level** (`feedbackResolveLine`, unchanged trigger point in `feedback.ipc.ts`): after the existing `createFeedbackLog(...)` call, if `input.flagId` is set, also set `resolved_at` on any annotation with `linked_flag_id = input.flagId` (there may be none, if the line's flag predates this feature or is `matcher`-origin — a no-op).

**Page-level** (`FlagsPanel.tsx`'s inline resolve UI, `flags.ipc.ts`'s `IPC.flagsResolve`): today this UI shows a note textarea and one "Confirm resolve" button. For a flag with `origin === 'ai'`, replace that with two buttons:

- **"Confirm as-is"** → `feedback_log` row: `field_changed: 'annotation'`, `ai_value: flag.message`, `human_value: flag.message`, `action: 'accepted'`, `flag_id: flag.id`, `quotation_line_id: null`.
- **"Add correction"** (disabled until the note is non-empty) → same row shape but `human_value: note`, `action: 'corrected'`.

Both then call `resolveFlag(flag.id, note)` as today, and both set `resolved_at` on the linked annotation (same as the line-level path). Flags with `origin !== 'ai'` keep exactly today's single "Confirm resolve" button and no `feedback_log` write.

New repository function `resolveAiAnnotation(flagId: string): void` in `annotationsRepo.ts` (sets `resolved_at = now()` where `linked_flag_id = ?`) is called from both IPC handlers above.

### Rendering: `AnnotationCanvas.tsx` / `PdfViewer.tsx`

- Pin rendering branches on `authorType`: `'ai'` uses the reserved color and a `Sparkles` icon (already used elsewhere for AI-generation UI, e.g. `TopBar.tsx`) instead of `MessageCircle`; `resolved_at !== null` additionally renders at reduced opacity (e.g. `opacity-50`) so resolved AI observations visually recede without disappearing. `'human'` pins are unchanged.
- `PdfViewer.tsx`'s `handleMarkerClick`: if `annotation.authorType === 'ai'`, return early (no `window.confirm`, no delete) — the hover `title` (already wired to `commentText`) is the only interaction, resolved or not.
- Undo/redo and "Clear annotations on this page" continue to operate only on human-drawn annotations, since AI pins are never created or deleted through those code paths.

### Types

- `Annotation` (`shared/types/entities.ts`) gains `linkedFlagId: string | null` and `resolvedAt: string | null`.
- `FeedbackLogEntry` gains `quotationLineId: string | null` (widened from `string`) and `flagId: string | null`.
- `CreateFeedbackLogInput` gains optional `flagId?: string` and `quotationLineId` becomes optional.

## Error handling

- Annotation creation for AI flags is best-effort within the quotation-generation transaction: if a single `createAiAnnotation` call fails, log and continue rather than rolling back the whole quotation/flag creation — consistent with the "best-effort, never block the main outcome" precedent from the AI usage governance work.
- `resolveAiAnnotation` is a no-op (updates zero rows) when no pin exists for that flag — e.g. flags from before this feature shipped, or non-`'ai'`-origin flags. No error path needed.

## Testing

- `.dbtest.ts`: generating a quotation whose extraction has `origin: 'ai'` flags creates matching annotation rows with the right `page_number`, `author_type: 'ai'`, and `linked_flag_id`; `origin: 'matcher'` flags do not get annotations.
- Multiple AI flags on the same page get distinct stacked `y` positions.
- Resolving a page-level AI flag via `IPC.flagsResolve`'s "Confirm as-is"/"Add correction" paths creates the expected `feedback_log` row (`action`, `ai_value`, `human_value`, `flag_id`) and sets `resolved_at` on the linked annotation; resolving a non-AI flag does neither.
- Resolving a line-level AI flag via `feedbackResolveLine` also sets `resolved_at` on its linked annotation (if one exists).
- Migration test: `feedback_log` accepts a row with `quotation_line_id: null` and a non-null `flag_id`; existing line-level rows still round-trip correctly after the table rebuild.

## Verification

- `npm run test:all` passing, including the new cases above.
- Manual, in the throwaway test project: generate a quotation on an SLD whose extraction has AI flags, confirm distinct purple/Sparkles pins appear on the correct pages, stacked if more than one lands on the same page. Hover shows the flag message; click does nothing. Resolve one page-level AI flag via "Confirm as-is" and another via "Add correction", confirm both pins dim (not disappear) and both produce a `feedback_log` row visible via direct DB inspection.
