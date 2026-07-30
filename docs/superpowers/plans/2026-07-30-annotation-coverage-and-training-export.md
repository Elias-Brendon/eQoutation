# Annotation Coverage, Line-Reveal, Training Export, Font Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four follow-ups from the second annotation review: (1) every extracted component gets an annotation, not just flagged ones, (2) clicking a row in the Quotation Table reveals that item's annotation even when the AI-annotation visibility toggle is off, (3) a Settings page action to export the accumulated `feedback_log` corpus for later model training, (4) a user-adjustable font size for annotation info-popover text.

**Architecture:** `annotations` gains a second nullable link, `linked_quotation_line_id`, alongside the existing `linked_flag_id` — every quotation line gets exactly one annotation row (bounding box from the component's own `boundingBox`, already captured by the extraction schema), which *also* carries `linked_flag_id` when that line happens to have an AI flag (so resolve-dimming still works). A new `createAiAnnotationsForLines` repository function replaces the per-line half of the old flag-driven creation path; the page-level (no-line) raw `extraction.flags` path is untouched. `CenterPanel` gains a second reveal handler mirroring the existing flag one, and `AnnotationCanvas`'s visibility filter is relaxed to always show the currently-highlighted box regardless of the global toggle. Training-data export is a new main-process function + IPC channel + Settings section, following the existing `exportProject` (native save dialog) pattern exactly. Font size is a new `AppSettings` field threaded down through the same prop chain as the existing `highlightedAnnotationId`/`showAiAnnotations`.

## Design Decisions

- **One annotation per line, not two.** A line that's both extracted-and-low-confidence keeps a single box (not a separate "component" box plus a separate "flag" box stacked on the same spot) — the box's `commentText` is the flag's message when one exists for that line, else a generated summary (`"<description> — <qty> <uom>, AI confidence <pct>%"`). `linked_flag_id` is set only when a flag exists for that line, enabling the existing resolve-dims-the-box behavior for flagged lines; non-flagged lines' boxes are permanent (nothing to resolve).
- **Matcher-origin flags are still excluded from annotation content** — a line that's *only* unmatched (no AI low-confidence flag) gets the generic summary text, not an "unmatched" message. Matching/catalog concerns stay a Flags-panel-only concern, consistent with the original non-goal.
- **Raw page-level `extraction.flags` (no specific line) are unaffected** — they keep going through the existing `createAiAnnotationsForFlags`/`origin==='ai'` path, since they were never "an item" to begin with.
- **Training export is global, not per-project** — a `feedback_log`-wide export makes sense for building one training corpus across everything reviewed so far, not scoped to whichever project happens to be open. JSONL output (one JSON object per line) since that's the standard ingest format for fine-tuning/training pipelines, enriched with SLD filename, project name, and the flag/line context needed to make each row self-describing outside the app's own DB.
- **Font size is a persistent setting**, not a per-session toolbar control — it lives in `AppSettings`/`settings.json` alongside `fontScale`, so it survives restarts like every other Settings > Font Size control.

## Global Constraints

- No change to human-authored annotation tools or their canvas-drawn rendering path.
- No backfill — existing annotations (pins and single-color-per-flag rectangles from earlier today) are untouched; only newly-generated quotations get per-line coverage and palette colors.
- DB-touching tests are `*.dbtest.ts` run via `npm run test:db`.

---

### Task 1: Migration — `annotations.linked_quotation_line_id`

**Files:**
- Create: `src/main/db/migrations/0022_annotation_quotation_line.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/db/migrations.dbtest.ts`

- [ ] **Step 1: Write the migration**

```ts
// src/main/db/migrations/0022_annotation_quotation_line.ts
export const sql = `
ALTER TABLE annotations ADD COLUMN linked_quotation_line_id TEXT REFERENCES quotation_lines(id) ON DELETE CASCADE;
`
```

- [ ] **Step 2: Register it**

In `src/main/db/migrations/index.ts`, add the import and array entry (version 22), following the existing pattern.

- [ ] **Step 3: Add a column-existence test**

In `src/main/db/migrations.dbtest.ts`:

```ts
  it('adds linked_quotation_line_id column to annotations', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(annotations)').all() as { name: string }[]
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['linked_quotation_line_id']))
  })
```

- [ ] **Step 4: Run and commit**

Run: `npm run test:db` — expect PASS.

```bash
git add src/main/db/migrations/0022_annotation_quotation_line.ts src/main/db/migrations/index.ts src/main/db/migrations.dbtest.ts
git commit -m "feat: add linked_quotation_line_id column to annotations"
```

---

### Task 2: Shared type — `Annotation.linkedQuotationLineId`

**Files:**
- Modify: `src/shared/types/entities.ts`

- [ ] **Step 1:** Add `linkedQuotationLineId: string | null` to the `Annotation` interface, right after `linkedFlagId`.

- [ ] **Step 2:** Run: `npm run typecheck` — expect FAIL only in `annotationsRepo.ts` (fixed in Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/entities.ts
git commit -m "feat: add linkedQuotationLineId to Annotation type"
```

---

### Task 3: `annotationsRepo.ts` — per-line annotation creation, nullable flag link

**Files:**
- Modify: `src/main/db/repositories/annotationsRepo.ts`
- Modify: `src/main/db/repositories/annotationsRepo.dbtest.ts`

**Interfaces:**
- Produces (consumed by Task 5 — `quotations.ipc.ts`): `export interface LineAnnotationInput { lineId: string; pageNumber: number; boundingBox: AnnotationBoundingBox | null; commentText: string; linkedFlagId: string | null }`, `export function createAiAnnotationsForLines(sldId: string, inputs: LineAnnotationInput[]): void`.

- [ ] **Step 1: Update `AnnotationRow`, `toAnnotation`, and `CreateAiAnnotationInput` for the new nullable-everything shape**

In `src/main/db/repositories/annotationsRepo.ts`:

```ts
interface AnnotationRow {
  id: string
  sld_id: string
  page_number: number
  author_type: Annotation['authorType']
  shape_type: Annotation['shapeType']
  path_data: string
  color: string
  stroke_width: number
  comment_text: string | null
  created_at: string
  linked_flag_id: string | null
  linked_quotation_line_id: string | null
  resolved_at: string | null
}
```

`toAnnotation` gains `linkedQuotationLineId: row.linked_quotation_line_id`. `insertAnnotation` (human path) sets `linked_quotation_line_id: null` in its row object and adds `linked_quotation_line_id` to its INSERT column list / `@linked_quotation_line_id` placeholder (alongside the existing `linked_flag_id`).

`CreateAiAnnotationInput` becomes:

```ts
export interface CreateAiAnnotationInput {
  sldId: string
  pageNumber: number
  commentText: string
  linkedFlagId: string | null
  linkedQuotationLineId: string | null
  boundingBox: AnnotationBoundingBox | null
  fallbackIndexOnPage?: number
  colorIndex: number
}
```

`createAiAnnotation`'s row construction adds `linked_quotation_line_id: input.linkedQuotationLineId` and includes it in the INSERT statement's column list / values.

- [ ] **Step 2: Update `createAiAnnotationsForFlags` for the now-required `linkedQuotationLineId` field**

It always passes `linkedQuotationLineId: null` (this function is only ever used for page-level flags with no line):

```ts
      createAiAnnotation({
        sldId,
        pageNumber: flag.pageNumber,
        commentText: flag.message,
        linkedFlagId: flag.id,
        linkedQuotationLineId: null,
        boundingBox,
        fallbackIndexOnPage,
        colorIndex: colorIndex++
      })
```

- [ ] **Step 3: Add `createAiAnnotationsForLines`**

Append to `src/main/db/repositories/annotationsRepo.ts`:

```ts
export interface LineAnnotationInput {
  lineId: string
  pageNumber: number
  boundingBox: AnnotationBoundingBox | null
  commentText: string
  linkedFlagId: string | null
}

// Called right after quotation generation, once per quotation line —
// every extracted component gets exactly one annotation (unlike
// createAiAnnotationsForFlags, which only covers flagged items). A line
// that also has an AI flag gets that flag's message and linked_flag_id
// (so resolving it still dims the box); otherwise the box is a plain,
// permanent record of what the AI extracted there.
export function createAiAnnotationsForLines(sldId: string, inputs: LineAnnotationInput[]): void {
  const fallbackCountByPage = new Map<number, number>()
  let colorIndex = 0
  for (const input of inputs) {
    let fallbackIndexOnPage: number | undefined
    if (!input.boundingBox) {
      fallbackIndexOnPage = fallbackCountByPage.get(input.pageNumber) ?? 0
      fallbackCountByPage.set(input.pageNumber, fallbackIndexOnPage + 1)
    }
    try {
      createAiAnnotation({
        sldId,
        pageNumber: input.pageNumber,
        commentText: input.commentText,
        linkedFlagId: input.linkedFlagId,
        linkedQuotationLineId: input.lineId,
        boundingBox: input.boundingBox,
        fallbackIndexOnPage,
        colorIndex: colorIndex++
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for line', input.lineId, err)
    }
  }
}
```

- [ ] **Step 4: Update existing dbtest calls for the new required fields, add new tests**

In `src/main/db/repositories/annotationsRepo.dbtest.ts`, every existing `createAiAnnotation({...})` call needs `linkedQuotationLineId: null` added. Add `createAiAnnotationsForLines` to the import.

Add a second helper alongside the existing `createProjectSldQuotation`, copied from `feedbackLogRepo.dbtest.ts`'s `createProjectSldQuotationLine` (same DB shape, same file convention — both dbtest files build their own fixtures rather than importing each other's):

```ts
function createProjectSldQuotationLine(): { sldId: string; quotationId: string; lineId: string } {
  const { sldId, quotationId } = createProjectSldQuotation()
  const now = new Date().toISOString()
  const lineId = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO quotation_lines
         (id, quotation_id, catalog_item_id, page_number, tag, description, maker, qty, uom,
          list_price, discount_factor, unit_cost, total_cost, margin, quote_price, match_status, match_confidence,
          ai_confidence, panel_name, sku, component_type, created_at)
       VALUES (?, ?, NULL, 1, '', 'desc', '', 1, 'PC', 0, 1, 0, 0, 1, 0, 'matched', 1, 1, '', '', '', ?)`
    )
    .run(lineId, quotationId, now)
  return { sldId, quotationId, lineId }
}
```

Add:

```ts
describe('createAiAnnotationsForLines', () => {
  it('creates one annotation per line, using the flag message when one is linked', () => {
    const { sldId, quotationId, lineId } = createProjectSldQuotationLine()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'Low-confidence extraction: "X"', pageNumber: 1, quotationLineId: lineId }
    ])

    createAiAnnotationsForLines(sldId, [
      {
        lineId,
        pageNumber: 1,
        boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
        commentText: flag.message,
        linkedFlagId: flag.id
      }
    ])

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.linkedQuotationLineId).toBe(lineId)
    expect(annotation.linkedFlagId).toBe(flag.id)
    expect(annotation.commentText).toBe(flag.message)
  })

  it('creates an unflagged annotation with no linked_flag_id for a plain line', () => {
    const { sldId, lineId } = createProjectSldQuotationLine()

    createAiAnnotationsForLines(sldId, [
      {
        lineId,
        pageNumber: 1,
        boundingBox: null,
        commentText: 'Some MCB — 1 nos, AI confidence 92%',
        linkedFlagId: null
      }
    ])

    const [annotation] = listAnnotationsBySld(sldId)
    expect(annotation.linkedQuotationLineId).toBe(lineId)
    expect(annotation.linkedFlagId).toBeNull()
    expect(annotation.resolvedAt).toBeNull()
  })
})
```

(Note: `createFlags`' `CreateFlagInput` already supports `quotationLineId` — confirm the test helper matches the real shape used elsewhere in this file.)

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npm run test:db` then `npm run typecheck` — expect PASS (the `quotations.ipc.ts` call site is fixed in Task 5, so a transient failure there is expected until that task lands, per this plan's established cross-task pattern).

```bash
git add src/main/db/repositories/annotationsRepo.ts src/main/db/repositories/annotationsRepo.dbtest.ts
git commit -m "feat: create one annotation per quotation line, not just flagged ones"
```

---

### Task 4: `flagsRepo.ts` — confirm `CreateFlagInput.quotationLineId` supports the lookup Task 5 needs

**Files:**
- Read-only check, no changes expected — `CreateFlagInput` already has `quotationLineId?: string | null` and `createFlags` returns `Flag[]` with `quotationLineId` populated per created row (existing behavior from the original AI-annotations plan). Skip if confirmed unchanged; this task exists only to catch drift before Task 5 relies on it.

- [ ] **Step 1:** Read `src/main/db/repositories/flagsRepo.ts`'s `CreateFlagInput` and `toFlag` to confirm `quotationLineId` round-trips on the returned `Flag[]` from `createFlags`. No commit needed if unchanged.

---

### Task 5: `quotations.ipc.ts` — one annotation per line, always

**Files:**
- Modify: `src/main/ipc/quotations.ipc.ts`

- [ ] **Step 1: Split flag creation into "per-line" and "page-level" groups, and add per-line annotation creation**

Replace the flag-building block (the one added in the bounding-box plan) with:

```ts
    const perLineFlagInputs: CreateFlagInput[] = []
    for (let i = 0; i < lineInputs.length; i++) {
      const lineInput = lineInputs[i]
      if (lineInput.matchStatus === 'unknown') {
        perLineFlagInputs.push({
          quotationLineId: lineInput.id,
          origin: 'matcher',
          severity: 'warning',
          message: `Unmatched item: "${lineInput.description}" (page ${lineInput.pageNumber}) — no catalog match found.`,
          pageNumber: lineInput.pageNumber
        })
      }
      if (lineInput.aiConfidence < confidenceThreshold) {
        perLineFlagInputs.push({
          quotationLineId: lineInput.id,
          origin: 'ai',
          severity: 'warning',
          message: `Low-confidence extraction: "${lineInput.description}" (page ${lineInput.pageNumber}) — AI confidence ${(lineInput.aiConfidence * 100).toFixed(0)}%.`,
          pageNumber: lineInput.pageNumber
        })
      }
    }
    const perLineCreatedFlags =
      perLineFlagInputs.length > 0 ? createFlags(quotation.id, perLineFlagInputs) : []

    const rawFlagInputs: CreateFlagInput[] = []
    const rawBoundingBoxes: (AnnotationBoundingBox | null)[] = []
    for (const flag of extraction.flags) {
      rawFlagInputs.push({
        quotationLineId: null,
        origin: 'ai',
        severity: flag.severity,
        message: flag.message,
        pageNumber: flag.pageNumber
      })
      rawBoundingBoxes.push(flag.boundingBox)
    }
    if (rawFlagInputs.length > 0) {
      const rawCreatedFlags = createFlags(quotation.id, rawFlagInputs)
      createAiAnnotationsForFlags(sldId, rawCreatedFlags, rawBoundingBoxes)
    }

    const lineAnnotationInputs: LineAnnotationInput[] = lineInputs.map((lineInput, i) => {
      const component = extraction.components[i]
      const aiFlagForLine = perLineCreatedFlags.find(
        (f) => f.origin === 'ai' && f.quotationLineId === lineInput.id
      )
      return {
        lineId: lineInput.id,
        pageNumber: lineInput.pageNumber,
        boundingBox: component.boundingBox,
        commentText:
          aiFlagForLine?.message ??
          `${lineInput.description} — ${lineInput.qty} ${lineInput.uom}, AI confidence ${(lineInput.aiConfidence * 100).toFixed(0)}%.`,
        linkedFlagId: aiFlagForLine?.id ?? null
      }
    })
    createAiAnnotationsForLines(sldId, lineAnnotationInputs)
```

Update the import from `../db/repositories/annotationsRepo`:

```ts
import {
  createAiAnnotationsForFlags,
  createAiAnnotationsForLines,
  type LineAnnotationInput
} from '../db/repositories/annotationsRepo'
```

- [ ] **Step 2: Type-check, run full suite, commit**

Run: `npm run typecheck` then `npm run test:all` — expect PASS.

```bash
git add src/main/ipc/quotations.ipc.ts
git commit -m "feat: create an annotation for every quotation line on generation, not just flagged ones"
```

---

### Task 6: `CenterPanel.tsx` — reveal-by-line-click handler

**Files:**
- Modify: `src/renderer/src/components/layout/CenterPanel.tsx`

**Interfaces:**
- Produces (consumed by Task 7 — `QuotationTable.tsx`): `onRevealLineAnnotation: (lineId: string) => void` passed to `QuotationTable`.

- [ ] **Step 1: Refactor the existing flag-reveal logic into a shared helper, add the line-reveal handler**

Replace:

```ts
  const handleFocusFlag = (flagId: string): void => {
    const annotation = sldAnnotations.find((a) => a.linkedFlagId === flagId)
    if (!annotation) return
    setFocusPage(annotation.pageNumber)
    setHighlightedAnnotationId(annotation.id)
  }
```

with:

```ts
  const revealAnnotation = (annotation: Annotation | undefined): void => {
    if (!annotation) return
    setFocusPage(annotation.pageNumber)
    setHighlightedAnnotationId(annotation.id)
  }

  const handleFocusFlag = (flagId: string): void =>
    revealAnnotation(sldAnnotations.find((a) => a.linkedFlagId === flagId))

  const handleRevealLineAnnotation = (lineId: string): void =>
    revealAnnotation(sldAnnotations.find((a) => a.linkedQuotationLineId === lineId))
```

Add `Annotation` to the type-only import from `@shared/types/entities` (already imports `PanelMode, Sld` there — extend that line).

- [ ] **Step 2: Pass the new handler to `QuotationTable`**

Find the `<QuotationTable sldId={sld.id} projectId={sld.projectId} onFocusLine={setFocusPage} />` render and add `onRevealLineAnnotation={handleRevealLineAnnotation}`.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck` — expect FAIL only in `QuotationTable.tsx` (fixed in Task 7).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/CenterPanel.tsx
git commit -m "feat: add line-click annotation reveal handler in CenterPanel"
```

---

### Task 7: `QuotationTable.tsx` — wire the row click to reveal its annotation

**Files:**
- Modify: `src/renderer/src/components/quotation/QuotationTable.tsx`

**Interfaces:**
- Consumes: `onRevealLineAnnotation` (Task 6).

- [ ] **Step 1: Accept the new prop**

```ts
interface QuotationTableProps {
  sldId: string
  projectId: string
  onFocusLine?: (pageNumber: number) => void
  onRevealLineAnnotation?: (lineId: string) => void
}

export function QuotationTable({
  sldId,
  projectId,
  onFocusLine,
  onRevealLineAnnotation
}: QuotationTableProps): React.JSX.Element {
```

- [ ] **Step 2: Call it from the row's `onClick`**

Change:

```tsx
                  onClick={() => onFocusLine?.(line.pageNumber)}
```

to:

```tsx
                  onClick={() => {
                    onFocusLine?.(line.pageNumber)
                    onRevealLineAnnotation?.(line.id)
                  }}
```

- [ ] **Step 3: Type-check, commit**

Run: `npm run typecheck` — expect PASS.

```bash
git add src/renderer/src/components/quotation/QuotationTable.tsx
git commit -m "feat: reveal a quotation line's annotation on row click"
```

---

### Task 8: `AnnotationCanvas.tsx` — highlighted box always visible regardless of toggle

**Files:**
- Modify: `src/renderer/src/components/pdf/AnnotationCanvas.tsx`

- [ ] **Step 1: Relax the visibility filter**

Change:

```ts
  const aiBoxes = showAiAnnotations
    ? annotations.filter(
        (a) => a.authorType === 'ai' && a.shapeType === 'rectangle' && a.points.length === 2
      )
    : []
```

to:

```ts
  const aiBoxes = annotations.filter(
    (a) =>
      a.authorType === 'ai' &&
      a.shapeType === 'rectangle' &&
      a.points.length === 2 &&
      (showAiAnnotations || a.id === highlightedAnnotationId)
  )
```

- [ ] **Step 2: Type-check, run full suite, commit**

Run: `npm run typecheck` then `npm run test:all` — expect PASS.

```bash
git add src/renderer/src/components/pdf/AnnotationCanvas.tsx
git commit -m "feat: show the highlighted AI annotation even when visibility is toggled off"
```

---

### Task 9: Training-data export — main-process function

**Files:**
- Create: `src/main/export/trainingDataExporter.ts`

**Interfaces:**
- Produces (consumed by Task 10 — IPC): `export async function exportTrainingData(): Promise<string | null>`.

- [ ] **Step 1: Write the exporter**

```ts
// src/main/export/trainingDataExporter.ts
import { app, dialog, BrowserWindow } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { getDb } from '../db/index'

interface TrainingDataRow {
  id: string
  field_changed: string
  ai_value: string
  human_value: string
  action: string
  note: string | null
  created_at: string
  flag_message: string | null
  flag_severity: string | null
  line_description: string | null
  line_sku: string | null
  page_number: number | null
  sld_filename: string | null
  project_name: string | null
}

// Exports every feedback_log row (across all projects — this is meant to
// become one training corpus, not a per-project artifact) as JSONL, enriched
// with enough context (SLD filename, project, flag/line text) that each row
// is self-describing outside this app's own database.
export async function exportTrainingData(): Promise<string | null> {
  const dateStamp = new Date().toISOString().slice(0, 10)

  const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
  const result = await dialog.showSaveDialog(focusedWindow as BrowserWindow, {
    title: 'Export training data',
    defaultPath: join(app.getPath('downloads'), `training-data-export-${dateStamp}.jsonl`),
    filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }]
  })
  if (result.canceled || !result.filePath) return null

  const rows = getDb()
    .prepare(
      `SELECT
         fl.id, fl.field_changed, fl.ai_value, fl.human_value, fl.action, fl.note, fl.created_at,
         f.message AS flag_message, f.severity AS flag_severity,
         ql.description AS line_description, ql.sku AS line_sku,
         COALESCE(f.page_number, ql.page_number) AS page_number,
         s.filename AS sld_filename, p.name AS project_name
       FROM feedback_log fl
       LEFT JOIN flags f ON f.id = fl.flag_id
       LEFT JOIN quotation_lines ql ON ql.id = fl.quotation_line_id
       LEFT JOIN quotations q ON q.id = COALESCE(f.quotation_id, ql.quotation_id)
       LEFT JOIN slds s ON s.id = q.sld_id
       LEFT JOIN projects p ON p.id = s.project_id
       ORDER BY fl.created_at ASC`
    )
    .all() as TrainingDataRow[]

  const output = createWriteStream(result.filePath)
  for (const row of rows) {
    const record = {
      id: row.id,
      project: row.project_name,
      sldFilename: row.sld_filename,
      pageNumber: row.page_number,
      fieldChanged: row.field_changed,
      aiValue: row.ai_value,
      humanValue: row.human_value,
      action: row.action,
      note: row.note,
      flagMessage: row.flag_message,
      flagSeverity: row.flag_severity,
      lineDescription: row.line_description,
      lineSku: row.line_sku,
      createdAt: row.created_at
    }
    output.write(JSON.stringify(record) + '\n')
  }
  await new Promise<void>((resolve, reject) => {
    output.end((err: unknown) => (err ? reject(err) : resolve()))
  })

  return result.filePath
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck` — expect PASS (no other files reference this yet).

- [ ] **Step 3: Commit**

```bash
git add src/main/export/trainingDataExporter.ts
git commit -m "feat: add training-data JSONL exporter"
```

---

### Task 10: Training-data export — IPC + preload + renderer hook

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/export.ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/state/queries/useExport.ts`

- [ ] **Step 1: Add the IPC channel**

In `src/shared/types/ipc-contract.ts`, add after `exportProject: 'export:project'`:

```ts
  exportTrainingData: 'export:trainingData'
```

- [ ] **Step 2: Register the handler**

In `src/main/ipc/export.ipc.ts`:

```ts
import { shell } from 'electron'
import { exportProject } from '../export/projectExporter'
import { exportTrainingData } from '../export/trainingDataExporter'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'

export function registerExportIpc(): void {
  safeHandle(IPC.exportProject, async (_event, projectId: string): Promise<string | null> => {
    const filePath = await exportProject(projectId)
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })

  safeHandle(IPC.exportTrainingData, async (): Promise<string | null> => {
    const filePath = await exportTrainingData()
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })
}
```

- [ ] **Step 3: Update preload**

In `src/preload/index.ts`'s `export` block:

```ts
  export: {
    project: (projectId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.exportProject, projectId),
    trainingData: (): Promise<string | null> => ipcRenderer.invoke(IPC.exportTrainingData)
  }
```

- [ ] **Step 4: Add the renderer hook**

In `src/renderer/src/state/queries/useExport.ts`:

```ts
export function useExportTrainingData(): UseMutationResult<string | null, Error, void> {
  return useMutation({
    mutationFn: () => window.api.export.trainingData()
  })
}
```

- [ ] **Step 5: Type-check, commit**

Run: `npm run typecheck` — expect PASS.

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/export.ipc.ts src/preload/index.ts src/renderer/src/state/queries/useExport.ts
git commit -m "feat: expose training-data export over IPC"
```

---

### Task 11: Settings — "Training Data" section

**Files:**
- Create: `src/renderer/src/components/settings/sections/TrainingDataSection.tsx`
- Modify: `src/renderer/src/components/settings/SettingsPage.tsx`

- [ ] **Step 1: Write the section**

```tsx
// src/renderer/src/components/settings/sections/TrainingDataSection.tsx
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { useExportTrainingData } from '@renderer/state/queries/useExport'

export function TrainingDataSection(): React.JSX.Element {
  const exportTrainingData = useExportTrainingData()

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Training Data</h3>
      <p className="text-xs text-text-secondary">
        Exports every recorded AI-vs-human correction (from resolving flags and confidence
        prompts, across all projects) as a JSON Lines file — useful later for expanding
        extraction rules or training a local model. Each row includes the SLD, page, and the
        original AI value alongside what a human confirmed or corrected it to.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => exportTrainingData.mutate()}
        disabled={exportTrainingData.isPending}
      >
        {exportTrainingData.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export training data (.jsonl)
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Register it in `SettingsPage.tsx`**

Add the import, extend `SectionId` with `'trainingData'`, add `{ id: 'trainingData', label: 'Training Data' }` to `NAV_ITEMS`, and render `{activeSection === 'trainingData' && <TrainingDataSection />}`.

- [ ] **Step 3: Type-check, commit**

Run: `npm run typecheck` — expect PASS.

```bash
git add src/renderer/src/components/settings/sections/TrainingDataSection.tsx src/renderer/src/components/settings/SettingsPage.tsx
git commit -m "feat: add Settings > Training Data export section"
```

---

### Task 12: Annotation font size — setting + control

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/settings/settingsStore.ts`
- Modify: `src/renderer/src/components/settings/sections/FontSizeSection.tsx`

- [ ] **Step 1: Add the field to `AppSettings`**

In `src/shared/types/entities.ts`, add `annotationFontSize: number` to `AppSettings`.

- [ ] **Step 2: Default + persist it**

In `src/main/settings/settingsStore.ts`, add `annotationFontSize: 12` to `defaultSettings()`, and `annotationFontSize: parsed.annotationFontSize ?? defaults.annotationFontSize` to the `getSettings()` merge object.

- [ ] **Step 3: Add the control**

In `src/renderer/src/components/settings/sections/FontSizeSection.tsx`, add below the existing `fontScale` buttons:

```tsx
      <div className="mt-2 flex flex-col gap-2">
        <h4 className="text-xs font-semibold text-text-primary">Annotation Text Size</h4>
        <p className="text-xs text-text-secondary">
          Font size of the AI annotation info popup shown on the PDF diagram.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={8}
            max={20}
            step={1}
            value={settings?.annotationFontSize ?? 12}
            onChange={(e) => updateSettings.mutate({ annotationFontSize: Number(e.target.value) })}
            className="w-40 accent-accent"
          />
          <span className="w-10 shrink-0 font-mono text-xs text-text-secondary">
            {settings?.annotationFontSize ?? 12}px
          </span>
        </div>
      </div>
```

- [ ] **Step 4: Type-check, run full suite, commit**

Run: `npm run typecheck` then `npm run test:all` — expect PASS.

```bash
git add src/shared/types/entities.ts src/main/settings/settingsStore.ts src/renderer/src/components/settings/sections/FontSizeSection.tsx
git commit -m "feat: add annotation text font size setting"
```

---

### Task 13: Thread `annotationFontSize` down to the info popover

**Files:**
- Modify: `src/renderer/src/components/layout/CenterPanel.tsx`
- Modify: `src/renderer/src/components/pdf/PdfViewer.tsx`
- Modify: `src/renderer/src/components/pdf/AnnotationCanvas.tsx`

- [ ] **Step 1: `CenterPanel.tsx` reads the setting and passes it down**

Add the import: `import { useSettings } from '@renderer/state/queries/useSettings'`. Add `const { data: settings } = useSettings()` near the other query hooks. Update the `<PdfViewer .../>` render to add `annotationFontSize={settings?.annotationFontSize ?? 12}`.

- [ ] **Step 2: `PdfViewer.tsx` accepts and forwards the prop**

Add `annotationFontSize: number` to `PdfViewerProps` and the destructured params. Pass it to `<AnnotationCanvas .../>` as `annotationFontSize={annotationFontSize}`.

- [ ] **Step 3: `AnnotationCanvas.tsx` applies it to the info popover**

Add `annotationFontSize: number` to `AnnotationCanvasProps` and destructured params. Apply it to the info-popover `<div>` (the one rendering `{box.commentText}`):

```tsx
              <div
                className="pointer-events-auto absolute left-0 top-full z-10 mt-1 max-w-[16rem] rounded-md border border-border-strong bg-surface-raised px-2 py-1.5 text-text-primary shadow-lg"
                style={{ fontSize: `${annotationFontSize}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                {box.commentText}
              </div>
```

(Drops the `text-xs` Tailwind class from that element since `fontSize` is now driven by the inline style instead.)

- [ ] **Step 4: Type-check, run full suite, commit**

Run: `npm run typecheck` then `npm run test:all` — expect PASS.

```bash
git add src/renderer/src/components/layout/CenterPanel.tsx src/renderer/src/components/pdf/PdfViewer.tsx src/renderer/src/components/pdf/AnnotationCanvas.tsx
git commit -m "feat: apply the annotation font size setting to the info popover"
```

---

### Task 14: Manual verification

**Files:** none.

- [ ] **Step 1:** Restart `npm run dev` (main-process changes throughout this plan need a full restart).
- [ ] **Step 2:** Re-generate a quotation on an SLD with many components. Confirm every component now has a box (not just flagged ones), each a distinct palette color, non-flagged ones showing a generated summary on click.
- [ ] **Step 3:** Toggle AI annotations off. Click a quotation-table row for an item that isn't currently flagged. Confirm its box appears anyway (and the PDF jumps to its page), then fades back out after the highlight window even though the toggle stays off.
- [ ] **Step 4:** Open Settings > Training Data, click export, confirm a `.jsonl` file is produced and each line is valid JSON with the expected fields (spot-check by opening the file).
- [ ] **Step 5:** Open Settings > Font Size, adjust the annotation text size slider, click an annotation box, confirm the popover text visibly changes size.
- [ ] **Step 6:** `npm run test:all` and `npm run typecheck` once more to confirm nothing regressed.
