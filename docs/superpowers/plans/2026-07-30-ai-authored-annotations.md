# AI-Authored Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn existing `origin: 'ai'` flags into permanent, visually distinct pin annotations on the SLD's PDF, and make every `'ai'`-flag resolution (line-level or page-level) produce a structured `feedback_log` row — building a durable corpus of "what the AI flagged" + "what a human decided" for later rule-expansion / local-model-training work.

**Architecture:** Two new nullable columns (`annotations.linked_flag_id`, `annotations.resolved_at`) link an AI-authored pin to the flag that produced it and record when that flag was resolved, without ever deleting the pin. `feedback_log` widens (`quotation_line_id` becomes nullable, new nullable `flag_id`) so page-level AI flags — which have no quotation line — can also produce a structured outcome row, alongside the line-level path that already exists. Pins are created in `quotations.ipc.ts` right after flags are created during quotation generation, and marked resolved (never deleted) from both existing flag-resolution code paths.

**Tech Stack:** Electron main process (better-sqlite3, hand-rolled SQL migrations), React 19 + TanStack Query renderer, Vitest (plain-Node config for pure logic, Electron-runtime config for real-DB repo tests).

## Global Constraints

- No AI-derived x/y coordinates — pin positions come from a fixed, stacked-per-page formula, not new extraction-schema output (per spec non-goals).
- No backfill for existing `origin: 'ai'` flags — this only applies to flags created by extractions going forward.
- Only `origin: 'ai'` flags get pins and structured `feedback_log` rows. `origin: 'matcher'` and `origin: 'human'` flags are completely unaffected — same resolve behavior as today.
- AI-authored annotations are never deleted and never user-editable: no undo/redo, no "Clear annotations on this page", no click-to-delete. Only `resolved_at` changes, and only via flag resolution.
- DB-touching tests are `*.dbtest.ts` run via `npm run test:db` (Electron-runtime, real `:memory:` SQLite). Pure-logic tests are `*.test.ts` run via `npm run test`. See existing `extractionsRepo.dbtest.ts` / `catalogRepo.dbtest.ts` for the established pattern.

---

### Task 1: Migration — annotation AI metadata columns

**Files:**
- Create: `src/main/db/migrations/0020_annotation_ai_metadata.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/db/migrations.dbtest.ts`

**Interfaces:**
- Produces: `annotations.linked_flag_id` (TEXT, nullable, FK → `flags.id` ON DELETE CASCADE), `annotations.resolved_at` (TEXT, nullable) — consumed by Task 4's `annotationsRepo.ts` changes.

- [ ] **Step 1: Write the migration file**

```ts
// src/main/db/migrations/0020_annotation_ai_metadata.ts
export const sql = `
ALTER TABLE annotations ADD COLUMN linked_flag_id TEXT REFERENCES flags(id) ON DELETE CASCADE;
ALTER TABLE annotations ADD COLUMN resolved_at TEXT;
`
```

- [ ] **Step 2: Register it in the migration runner**

In `src/main/db/migrations/index.ts`, add the import:

```ts
import { sql as m0020 } from './0020_annotation_ai_metadata'
```

Add to the end of the `migrations` array:

```ts
{ version: 20, name: '0020_annotation_ai_metadata', sql: m0020 }
```

- [ ] **Step 3: Add a column-existence test**

In `src/main/db/migrations.dbtest.ts`, add a new test in the `describe('migration runner', ...)` block, following the existing `extractions` column test:

```ts
  it('adds linked_flag_id and resolved_at columns to annotations', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(annotations)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toEqual(expect.arrayContaining(['linked_flag_id', 'resolved_at']))
  })
```

- [ ] **Step 4: Run the Electron-runtime test suite**

Run: `npm run test:db`
Expected: PASS, including the existing "applies every migration cleanly" test (auto-covers version 20) and the new column test.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/0020_annotation_ai_metadata.ts src/main/db/migrations/index.ts src/main/db/migrations.dbtest.ts
git commit -m "feat: add linked_flag_id and resolved_at columns to annotations"
```

---

### Task 2: Migration — widen feedback_log for page-level AI flags

**Files:**
- Create: `src/main/db/migrations/0021_feedback_log_flag_support.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/db/migrations.dbtest.ts`

**Interfaces:**
- Produces: `feedback_log.quotation_line_id` (now nullable), `feedback_log.flag_id` (TEXT, nullable, FK → `flags.id` ON DELETE CASCADE) — consumed by Task 5's `feedbackLogRepo.ts` changes.

- [ ] **Step 1: Write the migration file**

SQLite has no `ALTER COLUMN`, so this rebuilds the table — same pattern as the existing `0010_annotation_shapes.ts`:

```ts
// src/main/db/migrations/0021_feedback_log_flag_support.ts
export const sql = `
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
`
```

- [ ] **Step 2: Register it in the migration runner**

In `src/main/db/migrations/index.ts`, add the import:

```ts
import { sql as m0021 } from './0021_feedback_log_flag_support'
```

Add to the end of the `migrations` array:

```ts
{ version: 21, name: '0021_feedback_log_flag_support', sql: m0021 }
```

- [ ] **Step 3: Add tests confirming the widened schema**

In `src/main/db/migrations.dbtest.ts`:

```ts
  it('makes feedback_log.quotation_line_id nullable and adds flag_id', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(feedback_log)').all() as {
      name: string
      notnull: number
    }[]
    const quotationLineIdCol = columns.find((c) => c.name === 'quotation_line_id')
    expect(quotationLineIdCol?.notnull).toBe(0)
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['flag_id']))
  })

  it('accepts a feedback_log row with a null quotation_line_id and a flag_id', () => {
    const db = getDb()
    db.prepare(
      `INSERT INTO feedback_log (id, quotation_line_id, flag_id, field_changed, ai_value, human_value, action, note, created_at)
       VALUES ('fb-1', NULL, NULL, 'annotation', 'a', 'b', 'accepted', NULL, '2026-01-01T00:00:00.000Z')`
    ).run()
    const row = db.prepare('SELECT * FROM feedback_log WHERE id = ?').get('fb-1')
    expect(row).toBeTruthy()
  })
```

- [ ] **Step 4: Run the Electron-runtime test suite**

Run: `npm run test:db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/0021_feedback_log_flag_support.ts src/main/db/migrations/index.ts src/main/db/migrations.dbtest.ts
git commit -m "feat: widen feedback_log to support page-level AI flag outcomes"
```

---

### Task 3: Shared types

**Files:**
- Modify: `src/shared/types/entities.ts`

**Interfaces:**
- Produces: `Annotation.linkedFlagId: string | null`, `Annotation.resolvedAt: string | null`, `FeedbackLogEntry.quotationLineId: string | null` (widened from `string`), `FeedbackLogEntry.flagId: string | null` — consumed by Task 4 (`annotationsRepo.ts`) and Task 5 (`feedbackLogRepo.ts`).

- [ ] **Step 1: Widen `Annotation`**

In `src/shared/types/entities.ts`, modify the `Annotation` interface (currently at line 221):

```ts
export interface Annotation {
  id: string
  sldId: string
  pageNumber: number
  authorType: AnnotationAuthorType
  shapeType: AnnotationShapeType
  points: AnnotationPoint[]
  color: string
  strokeWidth: number
  commentText: string | null
  createdAt: string
  linkedFlagId: string | null
  resolvedAt: string | null
}
```

- [ ] **Step 2: Widen `FeedbackLogEntry`**

Modify the `FeedbackLogEntry` interface (currently at line 292):

```ts
export interface FeedbackLogEntry {
  id: string
  quotationLineId: string | null
  flagId: string | null
  fieldChanged: string
  aiValue: string
  humanValue: string
  action: FeedbackAction
  note: string | null
  createdAt: string
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `annotationsRepo.ts`'s `toAnnotation` and `feedbackLogRepo.ts`'s `toFeedbackLogEntry` don't yet populate the new required fields, and `feedbackLogRepo.ts`'s `CreateFeedbackLogInput`/`createFeedbackLog` still treat `quotationLineId` as required. This is expected; fixed in Tasks 4 and 5.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/entities.ts
git commit -m "feat: widen Annotation and FeedbackLogEntry types for AI annotations"
```

---

### Task 4: `annotationsRepo.ts` — AI annotation creation, stacking, resolution

**Files:**
- Modify: `src/main/db/repositories/annotationsRepo.ts`
- Create: `src/main/db/repositories/annotationsRepo.dbtest.ts`

**Interfaces:**
- Consumes: `annotations.linked_flag_id`/`resolved_at` columns (Task 1); `Annotation.linkedFlagId`/`resolvedAt` (Task 3); `Flag` type (existing, from `flagsRepo.ts`).
- Produces (consumed by Task 6 — `quotations.ipc.ts`; Task 7 — `feedback.ipc.ts`; Task 8 — `flags.ipc.ts`):
  - `export function stackedPinPosition(indexOnPage: number): AnnotationPoint`
  - `export interface CreateAiAnnotationInput { sldId: string; pageNumber: number; commentText: string; linkedFlagId: string; points: AnnotationPoint[] }`
  - `export function createAiAnnotation(input: CreateAiAnnotationInput): Annotation`
  - `export function createAiAnnotationsForFlags(sldId: string, flags: Flag[]): void`
  - `export function resolveAiAnnotation(flagId: string): void`

- [ ] **Step 1: Write the failing tests**

Create `src/main/db/repositories/annotationsRepo.dbtest.ts`:

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
  stackedPinPosition
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
     VALUES (?, ?, NULL, 'Q-TEST', 'draft', NULL, ?, ?)`
  ).run(quotationId, sldId, now, now)
  return { sldId, quotationId }
}

describe('stackedPinPosition', () => {
  it('stacks pins downward with a fixed x anchor', () => {
    expect(stackedPinPosition(0)).toEqual({ x: 0.03, y: 0.05 })
    expect(stackedPinPosition(1)).toEqual({ x: 0.03, y: 0.11 })
    expect(stackedPinPosition(2)).toEqual({ x: 0.03, y: 0.17 })
  })
})

describe('createAiAnnotation', () => {
  it('creates an ai-authored pin linked to a flag', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'Check this MCCB rating', pageNumber: 2 }
    ])

    const annotation = createAiAnnotation({
      sldId,
      pageNumber: 2,
      commentText: flag.message,
      linkedFlagId: flag.id,
      points: [stackedPinPosition(0)]
    })

    expect(annotation.authorType).toBe('ai')
    expect(annotation.shapeType).toBe('pin')
    expect(annotation.linkedFlagId).toBe(flag.id)
    expect(annotation.resolvedAt).toBeNull()
    expect(annotation.commentText).toBe('Check this MCCB rating')
  })
})

describe('createAiAnnotationsForFlags', () => {
  it('creates annotations only for ai-origin flags, stacked per page', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [
      { origin: 'ai', message: 'AI flag page 1 (a)', pageNumber: 1 },
      { origin: 'ai', message: 'AI flag page 1 (b)', pageNumber: 1 },
      { origin: 'ai', message: 'AI flag page 2', pageNumber: 2 },
      { origin: 'matcher', message: 'Unmatched item', pageNumber: 1 }
    ])

    createAiAnnotationsForFlags(sldId, flags)

    const annotations = listAnnotationsBySld(sldId)
    expect(annotations).toHaveLength(3)
    expect(annotations.every((a) => a.authorType === 'ai')).toBe(true)

    const page1 = annotations.filter((a) => a.pageNumber === 1).sort((a, b) => a.points[0].y - b.points[0].y)
    expect(page1[0].points[0]).toEqual(stackedPinPosition(0))
    expect(page1[1].points[0]).toEqual(stackedPinPosition(1))
  })

  it('skips ai flags with no page number', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [{ origin: 'ai', message: 'No page', pageNumber: null }])

    createAiAnnotationsForFlags(sldId, flags)

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
      points: [stackedPinPosition(0)]
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
Expected: FAIL — `createAiAnnotation`, `createAiAnnotationsForFlags`, `resolveAiAnnotation`, `stackedPinPosition` not exported yet.

- [ ] **Step 3: Implement the repository changes**

Replace the contents of `src/main/db/repositories/annotationsRepo.ts`:

```ts
import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type {
  Annotation,
  AnnotationPoint,
  CreateAnnotationInput,
  Flag
} from '@shared/types/entities'

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
  resolved_at: string | null
}

const AI_ANNOTATION_COLOR = '#a855f7'
const AI_PIN_ANCHOR_X = 0.03
const AI_PIN_BASE_Y = 0.05
const AI_PIN_STACK_STEP_Y = 0.06

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    sldId: row.sld_id,
    pageNumber: row.page_number,
    authorType: row.author_type,
    shapeType: row.shape_type,
    points: JSON.parse(row.path_data),
    color: row.color,
    strokeWidth: row.stroke_width,
    commentText: row.comment_text,
    createdAt: row.created_at,
    linkedFlagId: row.linked_flag_id,
    resolvedAt: row.resolved_at
  }
}

export function listAnnotationsBySldAndPage(sldId: string, pageNumber: number): Annotation[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM annotations WHERE sld_id = ? AND page_number = ? ORDER BY created_at ASC'
    )
    .all(sldId, pageNumber) as AnnotationRow[]
  return rows.map(toAnnotation)
}

export function listAnnotationsBySld(sldId: string): Annotation[] {
  const rows = getDb()
    .prepare('SELECT * FROM annotations WHERE sld_id = ? ORDER BY page_number ASC, created_at ASC')
    .all(sldId) as AnnotationRow[]
  return rows.map(toAnnotation)
}

export function insertAnnotation(input: CreateAnnotationInput): Annotation {
  const row: AnnotationRow = {
    id: randomUUID(),
    sld_id: input.sldId,
    page_number: input.pageNumber,
    author_type: 'human',
    shape_type: input.shapeType,
    path_data: JSON.stringify(input.points),
    color: input.color,
    stroke_width: input.strokeWidth ?? 2.5,
    comment_text: input.commentText ?? null,
    created_at: new Date().toISOString(),
    linked_flag_id: null,
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

export function deleteAnnotation(id: string): void {
  getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id)
}

// Fixed anchor, stacked per page — the AI has no spatial/region data to place
// a pin precisely, only a page number (see design spec's positioning
// non-goal). Multiple AI flags on the same page stack downward from here.
export function stackedPinPosition(indexOnPage: number): AnnotationPoint {
  return { x: AI_PIN_ANCHOR_X, y: AI_PIN_BASE_Y + AI_PIN_STACK_STEP_Y * indexOnPage }
}

export interface CreateAiAnnotationInput {
  sldId: string
  pageNumber: number
  commentText: string
  linkedFlagId: string
  points: AnnotationPoint[]
}

export function createAiAnnotation(input: CreateAiAnnotationInput): Annotation {
  const row: AnnotationRow = {
    id: randomUUID(),
    sld_id: input.sldId,
    page_number: input.pageNumber,
    author_type: 'ai',
    shape_type: 'pin',
    path_data: JSON.stringify(input.points),
    color: AI_ANNOTATION_COLOR,
    stroke_width: 2.5,
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

// Called right after quotation generation creates its batch of flags. Only
// origin:'ai' flags with a page number get a pin — matcher/human flags and
// page-less ai flags are silently skipped (see design spec's non-goals).
// Best-effort per flag: one failed insert must not block the rest, since
// this runs inside the larger quotation-generation flow.
export function createAiAnnotationsForFlags(sldId: string, flags: Flag[]): void {
  const countByPage = new Map<number, number>()
  for (const flag of flags) {
    if (flag.origin !== 'ai' || flag.pageNumber === null) continue
    const indexOnPage = countByPage.get(flag.pageNumber) ?? 0
    countByPage.set(flag.pageNumber, indexOnPage + 1)
    try {
      createAiAnnotation({
        sldId,
        pageNumber: flag.pageNumber,
        commentText: flag.message,
        linkedFlagId: flag.id,
        points: [stackedPinPosition(indexOnPage)]
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for flag', flag.id, err)
    }
  }
}

// Marks the pin resolved rather than deleting it — the point is a permanent
// record of what the AI flagged and that a human addressed it, for later
// training-data use. No-op if the flag has no linked annotation (predates
// this feature, or isn't ai-origin).
export function resolveAiAnnotation(flagId: string): void {
  getDb()
    .prepare('UPDATE annotations SET resolved_at = ? WHERE linked_flag_id = ?')
    .run(new Date().toISOString(), flagId)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db`
Expected: PASS — all `annotationsRepo.dbtest.ts` cases green, `migrations.dbtest.ts` still green.

Run: `npm run typecheck`
Expected: Still FAIL on `feedbackLogRepo.ts` only (Task 3's expected failure) — confirm no *new* failures.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repositories/annotationsRepo.ts src/main/db/repositories/annotationsRepo.dbtest.ts
git commit -m "feat: add AI-authored annotation creation, stacking, and resolution"
```

---

### Task 5: `feedbackLogRepo.ts` — nullable line, flag linkage

**Files:**
- Modify: `src/main/db/repositories/feedbackLogRepo.ts`
- Create: `src/main/db/repositories/feedbackLogRepo.dbtest.ts`

**Interfaces:**
- Consumes: `feedback_log.flag_id` column, nullable `quotation_line_id` (Task 2); `FeedbackLogEntry.quotationLineId`/`flagId` (Task 3).
- Produces (consumed by Task 7 — `feedback.ipc.ts`; Task 8 — `flags.ipc.ts`): `CreateFeedbackLogInput` with `quotationLineId?: string`, `flagId?: string`.

- [ ] **Step 1: Write the failing tests**

Create `src/main/db/repositories/feedbackLogRepo.dbtest.ts`:

```ts
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { createFlags } from './flagsRepo'
import { createFeedbackLog, listFeedbackByLine } from './feedbackLogRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

function createProjectSldQuotationLine(): { quotationId: string; lineId: string } {
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
     VALUES (?, ?, NULL, 'Q-TEST', 'draft', NULL, ?, ?)`
  ).run(quotationId, sldId, now, now)
  const lineId = randomUUID()
  db.prepare(
    `INSERT INTO quotation_lines
       (id, quotation_id, catalog_item_id, page_number, tag, description, maker, qty, uom,
        list_price, discount_factor, unit_cost, total_cost, margin, quote_price, match_status, match_confidence,
        ai_confidence, panel_name, sku, component_type, created_at)
     VALUES (?, ?, NULL, 1, '', 'desc', '', 1, 'PC', 0, 1, 0, 0, 1, 0, 'matched', 1, 1, '', '', '', ?)`
  ).run(lineId, quotationId, now)
  return { quotationId, lineId }
}

describe('createFeedbackLog', () => {
  it('creates a line-level entry as before', () => {
    const { lineId } = createProjectSldQuotationLine()
    const entry = createFeedbackLog({
      quotationLineId: lineId,
      fieldChanged: 'description',
      aiValue: 'old',
      humanValue: 'new',
      action: 'corrected'
    })
    expect(entry.quotationLineId).toBe(lineId)
    expect(entry.flagId).toBeNull()
    expect(listFeedbackByLine(lineId)).toHaveLength(1)
  })

  it('creates a page-level entry with a flag_id and no quotation_line_id', () => {
    const { quotationId } = createProjectSldQuotationLine()
    const [flag] = createFlags(quotationId, [
      { origin: 'ai', message: 'MSB panel name found', pageNumber: 1 }
    ])

    const entry = createFeedbackLog({
      flagId: flag.id,
      fieldChanged: 'annotation',
      aiValue: flag.message,
      humanValue: flag.message,
      action: 'accepted'
    })

    expect(entry.quotationLineId).toBeNull()
    expect(entry.flagId).toBe(flag.id)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db`
Expected: FAIL — `createFeedbackLog` currently requires `quotationLineId` and doesn't accept `flagId`; `FeedbackLogEntry.flagId` doesn't exist on the returned object.

- [ ] **Step 3: Implement the repository changes**

Replace the contents of `src/main/db/repositories/feedbackLogRepo.ts`:

```ts
import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { FeedbackAction, FeedbackLogEntry } from '@shared/types/entities'

interface FeedbackLogRow {
  id: string
  quotation_line_id: string | null
  flag_id: string | null
  field_changed: string
  ai_value: string
  human_value: string
  action: FeedbackAction
  note: string | null
  created_at: string
}

function toFeedbackLogEntry(row: FeedbackLogRow): FeedbackLogEntry {
  return {
    id: row.id,
    quotationLineId: row.quotation_line_id,
    flagId: row.flag_id,
    fieldChanged: row.field_changed,
    aiValue: row.ai_value,
    humanValue: row.human_value,
    action: row.action,
    note: row.note,
    createdAt: row.created_at
  }
}

export interface CreateFeedbackLogInput {
  quotationLineId?: string
  flagId?: string
  fieldChanged: string
  aiValue: string
  humanValue: string
  action: FeedbackAction
  note?: string | null
}

export function createFeedbackLog(input: CreateFeedbackLogInput): FeedbackLogEntry {
  const row: FeedbackLogRow = {
    id: randomUUID(),
    quotation_line_id: input.quotationLineId ?? null,
    flag_id: input.flagId ?? null,
    field_changed: input.fieldChanged,
    ai_value: input.aiValue,
    human_value: input.humanValue,
    action: input.action,
    note: input.note ?? null,
    created_at: new Date().toISOString()
  }

  getDb()
    .prepare(
      `INSERT INTO feedback_log
         (id, quotation_line_id, flag_id, field_changed, ai_value, human_value, action, note, created_at)
       VALUES
         (@id, @quotation_line_id, @flag_id, @field_changed, @ai_value, @human_value, @action, @note, @created_at)`
    )
    .run(row)

  return toFeedbackLogEntry(row)
}

export function listFeedbackByLine(quotationLineId: string): FeedbackLogEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM feedback_log WHERE quotation_line_id = ? ORDER BY created_at ASC')
    .all(quotationLineId) as FeedbackLogRow[]
  return rows.map(toFeedbackLogEntry)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS — this was the last type mismatch from Task 3's widened types.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repositories/feedbackLogRepo.ts src/main/db/repositories/feedbackLogRepo.dbtest.ts
git commit -m "feat: support page-level (flag-linked) feedback_log entries"
```

---

### Task 6: Wire annotation creation into quotation generation

**Files:**
- Modify: `src/main/ipc/quotations.ipc.ts`

**Interfaces:**
- Consumes: `createAiAnnotationsForFlags` (Task 4); `createFlags` return value (existing, `Flag[]`).

- [ ] **Step 1: Capture the created flags and create their annotations**

In `src/main/ipc/quotations.ipc.ts`, add `createAiAnnotationsForFlags` to the import from `../db/repositories/annotationsRepo`:

```ts
import { createAiAnnotationsForFlags } from '../db/repositories/annotationsRepo'
```

Change the existing (around line 126):

```ts
    if (flagInputs.length > 0) createFlags(quotation.id, flagInputs)
```

to:

```ts
    if (flagInputs.length > 0) {
      const createdFlags = createFlags(quotation.id, flagInputs)
      createAiAnnotationsForFlags(sldId, createdFlags)
    }
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/quotations.ipc.ts
git commit -m "feat: create AI-authored annotations alongside AI flags on quotation generation"
```

---

### Task 7: Line-level flag resolution also resolves its annotation

**Files:**
- Modify: `src/main/ipc/feedback.ipc.ts`

**Interfaces:**
- Consumes: `resolveAiAnnotation` (Task 4).

- [ ] **Step 1: Call `resolveAiAnnotation` alongside the existing `resolveFlag` call**

In `src/main/ipc/feedback.ipc.ts`, add to the import from `../db/repositories/flagsRepo`... actually add a new import:

```ts
import { resolveAiAnnotation } from '../db/repositories/annotationsRepo'
```

Change the existing block (around line 55):

```ts
      if (input.flagId && input.action !== 'flagged_for_later') {
        if (!getFlagById(input.flagId)) throw new AppError('DB_FLAG_NOT_FOUND')
        resolveFlag(input.flagId, input.note)
      }
```

to:

```ts
      if (input.flagId && input.action !== 'flagged_for_later') {
        if (!getFlagById(input.flagId)) throw new AppError('DB_FLAG_NOT_FOUND')
        resolveFlag(input.flagId, input.note)
        resolveAiAnnotation(input.flagId)
      }
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/feedback.ipc.ts
git commit -m "feat: resolve linked AI annotation when a line-level flag is resolved"
```

---

### Task 8: Page-level AI flag resolution — structured outcome

**Files:**
- Modify: `src/shared/types/ipc-contract.ts` (no channel name change, just noting where `flagsResolve` lives)
- Modify: `src/main/ipc/flags.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `createFeedbackLog` (existing, widened in Task 5); `resolveAiAnnotation` (Task 4); `getFlagById` (existing).
- Produces (consumed by Task 9 — `useFlags.ts`): `window.api.flags.resolve(id: string, resolutionNote?: string, outcome?: { action: 'accepted' | 'corrected'; value: string }): Promise<void>` (signature change — was 2 args, now 3).

- [ ] **Step 1: Update the `flags.ipc.ts` handler**

In `src/main/ipc/flags.ipc.ts`, add to the import from `../db/repositories/flagsRepo`, and add two new imports:

```ts
import { createFeedbackLog } from '../db/repositories/feedbackLogRepo'
import { resolveAiAnnotation } from '../db/repositories/annotationsRepo'
```

Replace the existing handler:

```ts
  safeHandle(IPC.flagsResolve, (_event, id: string, resolutionNote?: string): void =>
    resolveFlag(id, resolutionNote)
  )
```

with:

```ts
  safeHandle(
    IPC.flagsResolve,
    (
      _event,
      id: string,
      resolutionNote?: string,
      outcome?: { action: 'accepted' | 'corrected'; value: string }
    ): void => {
      const flag = getFlagById(id)
      if (!flag) throw new AppError('DB_FLAG_NOT_FOUND')

      resolveFlag(id, resolutionNote)

      if (flag.origin === 'ai' && outcome) {
        createFeedbackLog({
          flagId: id,
          fieldChanged: 'annotation',
          aiValue: flag.message,
          humanValue: outcome.value,
          action: outcome.action,
          note: resolutionNote
        })
      }
      resolveAiAnnotation(id)
    }
  )
```

(`resolveAiAnnotation` runs unconditionally — it's a no-op when the flag has no linked annotation, e.g. `matcher`/`human` origin, so this stays simple rather than branching twice on origin.)

- [ ] **Step 2: Update the preload API surface**

In `src/preload/index.ts`, replace the `flags.resolve` entry:

```ts
    resolve: (id: string, resolutionNote?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.flagsResolve, id, resolutionNote),
```

with:

```ts
    resolve: (
      id: string,
      resolutionNote?: string,
      outcome?: { action: 'accepted' | 'corrected'; value: string }
    ): Promise<void> => ipcRenderer.invoke(IPC.flagsResolve, id, resolutionNote, outcome),
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS (nothing else calls `window.api.flags.resolve` with a conflicting shape yet — the renderer call site is updated in Task 9).

- [ ] **Step 4: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/flags.ipc.ts src/preload/index.ts
git commit -m "feat: capture structured feedback_log outcome when resolving page-level AI flags"
```

---

### Task 9: Renderer data layer — resolve mutation outcome parameter

**Files:**
- Modify: `src/renderer/src/state/queries/useFlags.ts`

**Interfaces:**
- Consumes: `window.api.flags.resolve(id, resolutionNote?, outcome?)` (Task 8).
- Produces (consumed by Task 10 — `FlagsPanel.tsx`): `useResolveFlag(): UseMutationResult<void, Error, { id: string; resolutionNote?: string; outcome?: { action: 'accepted' | 'corrected'; value: string }; quotationId: string; projectId: string }>` (input type gains `outcome`).

- [ ] **Step 1: Update `useResolveFlag`**

In `src/renderer/src/state/queries/useFlags.ts`, replace:

```ts
export function useResolveFlag(): UseMutationResult<
  void,
  Error,
  { id: string; resolutionNote?: string; quotationId: string; projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolutionNote }) => window.api.flags.resolve(id, resolutionNote),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(variables.quotationId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(variables.projectId) })
    }
  })
}
```

with:

```ts
export function useResolveFlag(): UseMutationResult<
  void,
  Error,
  {
    id: string
    resolutionNote?: string
    outcome?: { action: 'accepted' | 'corrected'; value: string }
    quotationId: string
    projectId: string
  }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolutionNote, outcome }) =>
      window.api.flags.resolve(id, resolutionNote, outcome),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(variables.quotationId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(variables.projectId) })
    }
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS — `FlagsPanel.tsx`'s existing call (`resolveFlag.mutate({ id: flag.id, resolutionNote: ..., quotationId, projectId })`) still matches since `outcome` is optional.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/state/queries/useFlags.ts
git commit -m "feat: add outcome parameter to useResolveFlag mutation"
```

---

### Task 10: UI — two-button resolve for AI-origin flags

**Files:**
- Modify: `src/renderer/src/components/quotation/FlagsPanel.tsx`

**Interfaces:**
- Consumes: `useResolveFlag()` with `outcome` (Task 9).

- [ ] **Step 1: Update `handleResolve` to accept an outcome**

In `src/renderer/src/components/quotation/FlagsPanel.tsx`, replace:

```ts
  const handleResolve = (flag: Flag): void => {
    resolveFlag.mutate(
      { id: flag.id, resolutionNote: resolutionNote.trim() || undefined, quotationId, projectId },
      {
        onSuccess: () => {
          setResolvingId(null)
          setResolutionNote('')
        }
      }
    )
  }
```

with:

```ts
  const handleResolve = (
    flag: Flag,
    outcome?: { action: 'accepted' | 'corrected'; value: string }
  ): void => {
    resolveFlag.mutate(
      {
        id: flag.id,
        resolutionNote: resolutionNote.trim() || undefined,
        outcome,
        quotationId,
        projectId
      },
      {
        onSuccess: () => {
          setResolvingId(null)
          setResolutionNote('')
        }
      }
    )
  }
```

- [ ] **Step 2: Branch the inline resolve UI on `flag.origin`**

Replace the existing inline resolve block:

```tsx
              {resolvingId === flag.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Resolution note (optional)…"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setResolvingId(null)}>
                      Cancel
                    </Button>
                    <Button variant="success" size="sm" onClick={() => handleResolve(flag)}>
                      Confirm resolve
                    </Button>
                  </div>
                </div>
              ) : (
```

with:

```tsx
              {resolvingId === flag.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    placeholder={
                      flag.origin === 'ai'
                        ? 'Correction (required if the AI was wrong)…'
                        : 'Resolution note (optional)…'
                    }
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setResolvingId(null)}>
                      Cancel
                    </Button>
                    {flag.origin === 'ai' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleResolve(flag, { action: 'accepted', value: flag.message })
                          }
                        >
                          Confirm as-is
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={resolutionNote.trim().length === 0}
                          onClick={() =>
                            handleResolve(flag, {
                              action: 'corrected',
                              value: resolutionNote.trim()
                            })
                          }
                        >
                          Add correction
                        </Button>
                      </>
                    ) : (
                      <Button variant="success" size="sm" onClick={() => handleResolve(flag)}>
                        Confirm resolve
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/quotation/FlagsPanel.tsx
git commit -m "feat: two-button resolve (confirm as-is / add correction) for AI-origin flags"
```

---

### Task 11: Rendering — distinct AI pin style, no user-delete

**Files:**
- Modify: `src/renderer/src/components/pdf/AnnotationCanvas.tsx`
- Modify: `src/renderer/src/components/pdf/PdfViewer.tsx`

**Interfaces:**
- Consumes: `Annotation.authorType`, `Annotation.resolvedAt` (Task 3).

- [ ] **Step 1: Branch pin icon and opacity on `authorType`/`resolvedAt`**

In `src/renderer/src/components/pdf/AnnotationCanvas.tsx`, add `Sparkles` to the `lucide-react` import:

```ts
import { MessageCircle, Sparkles } from 'lucide-react'
```

Replace the pin-rendering block:

```tsx
      {pins.map((pin) => (
        <button
          key={pin.id}
          onClick={(e) => {
            e.stopPropagation()
            onMarkerClick(pin)
          }}
          className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 shadow"
          style={{
            left: `${pin.points[0].x * 100}%`,
            top: `${pin.points[0].y * 100}%`,
            backgroundColor: pin.color
          }}
          title={pin.commentText ?? ''}
        >
          <MessageCircle className="h-3 w-3 text-white" />
        </button>
      ))}
```

with:

```tsx
      {pins.map((pin) => (
        <button
          key={pin.id}
          onClick={(e) => {
            e.stopPropagation()
            onMarkerClick(pin)
          }}
          className={cn(
            'pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 shadow',
            pin.authorType === 'ai' && pin.resolvedAt !== null && 'opacity-50'
          )}
          style={{
            left: `${pin.points[0].x * 100}%`,
            top: `${pin.points[0].y * 100}%`,
            backgroundColor: pin.color
          }}
          title={pin.commentText ?? ''}
        >
          {pin.authorType === 'ai' ? (
            <Sparkles className="h-3 w-3 text-white" />
          ) : (
            <MessageCircle className="h-3 w-3 text-white" />
          )}
        </button>
      ))}
```

Add the `cn` import (the project's existing class-merge helper, already used elsewhere in this file's sibling components):

```ts
import { cn } from '@renderer/lib/cn'
```

- [ ] **Step 2: Skip the delete-confirm flow for AI pins**

In `src/renderer/src/components/pdf/PdfViewer.tsx`, replace:

```ts
  const handleMarkerClick = (annotation: Annotation): void => {
    const label = annotation.commentText ?? 'this annotation'
    const shouldDelete = window.confirm(`${label}\n\nDelete this comment?`)
    if (!shouldDelete) return
    deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
    pushHistory({ op: 'delete', annotations: [annotation] })
  }
```

with:

```ts
  const handleMarkerClick = (annotation: Annotation): void => {
    // AI-authored pins are a permanent record (see design spec) — no delete,
    // no confirm dialog. The hover title already shows the flag message.
    if (annotation.authorType === 'ai') return
    const label = annotation.commentText ?? 'this annotation'
    const shouldDelete = window.confirm(`${label}\n\nDelete this comment?`)
    if (!shouldDelete) return
    deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
    pushHistory({ op: 'delete', annotations: [annotation] })
  }
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/pdf/AnnotationCanvas.tsx src/renderer/src/components/pdf/PdfViewer.tsx
git commit -m "feat: distinct AI pin styling, no user-delete for AI-authored annotations"
```

---

### Task 12: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build and launch**

Run: `npm run dev` (kill any existing dev instance first — main-process changes in this plan require a restart).

- [ ] **Step 2: Verify pin creation**

In the throwaway `ZZ Stage3 Test Project` (never touch `substartion-One`), regenerate a quotation on an SLD whose extraction produced `origin: 'ai'` flags (either raw extraction flags or low-confidence line items). Confirm:
- Purple pins with a Sparkles icon appear on the correct page(s) in the PDF viewer.
- Multiple AI flags on the same page appear stacked, not overlapping.
- Hovering a pin shows the flag's message; clicking it does nothing (no delete prompt).

- [ ] **Step 3: Verify page-level resolve produces feedback_log + dims the pin**

Open the Flags panel, resolve a page-level AI flag (one with no associated line) using both paths at least once each: "Confirm as-is" on one, "Add correction" (with note text) on another. Confirm:
- Both pins on the PDF dim (reduced opacity) but remain visible — not deleted.
- Querying the `feedback_log` table directly shows one row per resolution, with `flag_id` set, `quotation_line_id` null, and `action`/`human_value` matching which button was used.

- [ ] **Step 4: Verify line-level resolve still works and also dims its pin**

Resolve a low-confidence line-level AI flag via the existing Confidence Resolve Drawer flow. Confirm the existing `feedback_log` behavior is unchanged (still tied to `quotation_line_id`) and that if that flag has a linked annotation, it also dims.

- [ ] **Step 5: Verify non-AI flags are unaffected**

Resolve a `matcher`-origin flag (unmatched catalog item) as before. Confirm no pin ever appeared for it, and resolving it does not create a `feedback_log` row.

- [ ] **Step 6: Final check**

Run: `npm run test:all` and `npm run typecheck` one more time to confirm nothing regressed from manual testing.
