# Manual BOM Add/Remove Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user manually add a component to a quotation's BOM (via an existing or newly-created catalog item) and remove a line that shouldn't be there, without needing a fresh AI extraction.

**Architecture:** A new nullable `removed_at` column soft-deletes lines; the one shared query every consumer already reads through (`getLinesForQuotation`) filters it out everywhere at once. Two new repo functions create lines (mirroring the existing generation-time pricing math), one soft-deletes. New IPC channels expose them; the remove handler also auto-resolves any open flags on the removed line. On the frontend, `CatalogResolveModal`'s search-or-add-new-catalog-item UI is extracted into a shared `CatalogItemPicker` so a new `AddLineModal` can reuse it verbatim; a small per-row remove button rounds it out.

**Tech Stack:** TypeScript, better-sqlite3 (via this project's migration runner), React, TanStack Query, Vitest (dbtest convention for repo-layer tests via `ELECTRON_RUN_AS_NODE`).

## Global Constraints

- Remove is a **soft delete** (`removed_at` timestamp), never a hard delete — preserves the record for potential future training-data use, consistent with how AI annotations are already permanent.
- Add **requires** a catalog item (existing or newly-created) — no free-text/unmatched manual lines.
- `getQuotationLineById` stays **unfiltered** by `removed_at` — other flows (flag resolution, etc.) look lines up by id regardless of removed status.
- New line defaults: `matchStatus: 'matched'`, `matchConfidence: 1`, `aiConfidence: 1`, `tag: ''`.
- `margin` for a new line comes from `getSettings().defaultMargin`, resolved by the **IPC handler** (not inside the repo function) — matches how `quotationsGenerate` already resolves settings once and passes concrete values into repo calls, and keeps repo functions free of an Electron/settings-file dependency for dbtest.
- Removing a line auto-resolves any of its open flags (via the existing `resolveFlag`), orchestrated in the IPC handler, not the repo layer — matches how `quotationsGenerate`'s handler already coordinates flags and lines together.
- No `AIProvider`/extraction changes — this only adds new manual paths alongside the existing generation flow.
- No renderer component tests — matches this codebase's existing convention (zero React test coverage); frontend changes are live-verified.

Every task's requirements implicitly include this section. Full rationale: `docs/superpowers/specs/2026-08-05-bom-manual-add-remove-design.md`.

---

### Task 1: Migration — soft-delete column

**Files:**
- Create: `src/main/db/migrations/0026_quotation_line_soft_delete.ts`
- Modify: `src/main/db/migrations/index.ts`

**Interfaces:**
- Produces: `quotation_lines.removed_at` column (nullable TEXT), migration version 26 registered.

- [ ] **Step 1: Create the migration file**

```ts
export const sql = `
ALTER TABLE quotation_lines ADD COLUMN removed_at TEXT NULL;
`
```

- [ ] **Step 2: Register it in the migration index**

In `src/main/db/migrations/index.ts`, add the import:

```ts
import { sql as m0026 } from './0026_quotation_line_soft_delete'
```

And append to the `migrations` array:

```ts
  { version: 26, name: '0026_quotation_line_soft_delete', sql: m0026 }
```

- [ ] **Step 3: Run the DB test suite to confirm the migration applies cleanly**

Run: `npm run test:db`
Expected: PASS (this exercises the full migration runner against a fresh test DB on every run — a broken migration fails loudly here).

- [ ] **Step 4: Commit**

```bash
git add src/main/db/migrations/0026_quotation_line_soft_delete.ts src/main/db/migrations/index.ts
git commit -m "feat: add soft-delete column for quotation lines"
```

---

### Task 2: Repo layer — add/remove functions and soft-delete filtering

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/db/repositories/quotationsRepo.ts`
- Create: `src/main/db/repositories/quotationsRepo.dbtest.ts`

**Interfaces:**
- Consumes: `getCatalogItemById` from `./catalogRepo`; `AppError` from `../../errors/AppError`; `NewCatalogItemInput`, `QuotationLine` from `@shared/types/entities`.
- Produces:
  - `interface AddQuotationLineInput { pageNumber: number; panelName: string; qty: number }` (in `@shared/types/entities.ts`, so `preload/index.ts` can use it too — Task 3)
  - `addQuotationLine(quotationId: string, catalogItemId: string, input: AddQuotationLineInput, margin: number): QuotationLine`
  - `addQuotationLineWithNewCatalogItem(quotationId: string, catalogInput: NewCatalogItemInput, input: AddQuotationLineInput, margin: number): QuotationLine` — this one is `async` (it calls the existing async `addCatalogItem`)
  - `removeQuotationLine(lineId: string): void`
  - `getLinesForQuotation` now excludes rows with a non-null `removed_at`.

- [ ] **Step 1: Write the failing tests**

Create `src/main/db/repositories/quotationsRepo.dbtest.ts`:

```ts
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { insertCatalogItem } from './catalogRepo'
import {
  addQuotationLine,
  getQuotationById,
  getQuotationLineById,
  removeQuotationLine
} from './quotationsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

// Minimal project -> sld -> quotation chain so a quotation_line can legally
// reference a real quotation_id (NOT NULL FK). Mirrors the fixture pattern
// already used in catalogRepo.dbtest.ts / feedbackLogRepo.dbtest.ts.
function createQuotation(): string {
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
    "INSERT INTO quotations (id, sld_id, code, created_at, updated_at) VALUES (?, ?, 'Q-TEST', ?, ?)"
  ).run(quotationId, sldId, now, now)

  return quotationId
}

describe('addQuotationLine', () => {
  it('creates a matched line priced from the catalog item, using the given margin', () => {
    const quotationId = createQuotation()
    const catalogItem = insertCatalogItem({
      sku: 'SKU-1',
      description: 'Test breaker',
      unitPrice: 10,
      uom: 'nos'
    })

    const line = addQuotationLine(
      quotationId,
      catalogItem.id,
      { pageNumber: 2, panelName: '250A DB-G1', qty: 3 },
      1.5
    )

    expect(line.quotationId).toBe(quotationId)
    expect(line.catalogItemId).toBe(catalogItem.id)
    expect(line.pageNumber).toBe(2)
    expect(line.panelName).toBe('250A DB-G1')
    expect(line.qty).toBe(3)
    expect(line.description).toBe('Test breaker')
    expect(line.sku).toBe('SKU-1')
    expect(line.unitCost).toBe(10)
    expect(line.totalCost).toBe(30)
    expect(line.margin).toBe(1.5)
    expect(line.quotePrice).toBe(45)
    expect(line.matchStatus).toBe('matched')
    expect(line.matchConfidence).toBe(1)
    expect(line.aiConfidence).toBe(1)
  })

  it('throws DB_CATALOG_ITEM_NOT_FOUND for a bad catalog item id', () => {
    const quotationId = createQuotation()
    expect(() =>
      addQuotationLine(quotationId, randomUUID(), { pageNumber: 1, panelName: 'X', qty: 1 }, 1.35)
    ).toThrow('DB_CATALOG_ITEM_NOT_FOUND')
  })
})

// No dbtest for addQuotationLineWithNewCatalogItem: it calls addCatalogItem
// (catalogWriter.ts), which reads/writes an actual .xlsx source file via
// getCatalogStatus()/ExcelJS — not something this repo's dbtest fixtures set
// up. Matches flags.ipc.ts's addCatalogItemAndLink, which calls the same
// function and also has no dbtest. Covered by Task 7's live verification.

describe('removeQuotationLine', () => {
  it('sets removed_at and excludes the line from getLinesForQuotation/getQuotationById afterward', () => {
    const quotationId = createQuotation()
    const catalogItem = insertCatalogItem({ sku: 'SKU-2', description: 'Removable', unitPrice: 5 })
    const line = addQuotationLine(
      quotationId,
      catalogItem.id,
      { pageNumber: 1, panelName: 'X', qty: 1 },
      1.35
    )

    removeQuotationLine(line.id)

    const quotation = getQuotationById(quotationId)
    expect(quotation?.lines.find((l) => l.id === line.id)).toBeUndefined()
  })

  it('still returns the removed line via getQuotationLineById (unfiltered lookup)', () => {
    const quotationId = createQuotation()
    const catalogItem = insertCatalogItem({ sku: 'SKU-3', description: 'Still findable', unitPrice: 5 })
    const line = addQuotationLine(
      quotationId,
      catalogItem.id,
      { pageNumber: 1, panelName: 'X', qty: 1 },
      1.35
    )

    removeQuotationLine(line.id)

    expect(getQuotationLineById(line.id)).not.toBeNull()
  })

  it('throws DB_QUOTATION_LINE_NOT_FOUND for a bad line id', () => {
    expect(() => removeQuotationLine(randomUUID())).toThrow('DB_QUOTATION_LINE_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run --config vitest.electron.config.ts src/main/db/repositories/quotationsRepo.dbtest.ts`
Expected: FAIL — `addQuotationLine`/`addQuotationLineWithNewCatalogItem`/`removeQuotationLine` not exported yet.

- [ ] **Step 3: Implement**

In `src/main/db/repositories/quotationsRepo.ts`, add the import at the top:

```ts
import { getCatalogItemById } from './catalogRepo'
import { addCatalogItem } from '../../catalog/catalogWriter'
```

(alongside the existing imports — `getDb`, `AppError`, and the `@shared/types/entities` import already there).

`AddQuotationLineInput` needs to be a **shared** type (both `preload/index.ts` and this repo file need it, and preload can only import from `@shared/types/*`, never from `src/main`). Add it to `src/shared/types/entities.ts`, near the existing `QuotationLine`/`Quotation` interfaces:

```ts
export interface AddQuotationLineInput {
  pageNumber: number
  panelName: string
  qty: number
}
```

Then in `quotationsRepo.ts`, add `AddQuotationLineInput` and `NewCatalogItemInput` to the existing `@shared/types/entities` import at the top of the file (it currently imports `CatalogItem, Quotation, QuotationLine, QuotationStatus, QuotationLineMatchStatus`).

Modify `getLinesForQuotation` (add the `AND removed_at IS NULL` clause):

```ts
function getLinesForQuotation(quotationId: string): QuotationLine[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM quotation_lines WHERE quotation_id = ? AND removed_at IS NULL ORDER BY page_number ASC, created_at ASC'
    )
    .all(quotationId) as QuotationLineRow[]
  return rows.map(toLine)
}
```

Add near the end of the file (after `updatePanelMargin`, before `getLatestQuotationForSld` — grouping the new line-mutation functions with the existing ones):

```ts
export function addQuotationLine(
  quotationId: string,
  catalogItemId: string,
  input: AddQuotationLineInput,
  margin: number
): QuotationLine {
  const catalogItem = getCatalogItemById(catalogItemId)
  if (!catalogItem) throw new AppError('DB_CATALOG_ITEM_NOT_FOUND')

  const db = getDb()
  const now = new Date().toISOString()
  const id = randomUUID()
  const unitCost = catalogItem.unitPrice
  const totalCost = input.qty * unitCost
  const quotePrice = totalCost * margin

  db.prepare(
    `INSERT INTO quotation_lines
       (id, quotation_id, catalog_item_id, page_number, panel_name, tag, sku, component_type, description, maker, qty, uom,
        list_price, discount_factor, unit_cost, total_cost, margin, quote_price,
        match_status, match_confidence, ai_confidence, created_at)
     VALUES
       (@id, @quotation_id, @catalog_item_id, @page_number, @panel_name, '', @sku, '', @description, @maker, @qty, @uom,
        @list_price, @discount_factor, @unit_cost, @total_cost, @margin, @quote_price,
        'matched', 1, 1, @created_at)`
  ).run({
    id,
    quotation_id: quotationId,
    catalog_item_id: catalogItem.id,
    page_number: input.pageNumber,
    panel_name: input.panelName,
    sku: catalogItem.sku,
    description: catalogItem.description,
    maker: catalogItem.maker,
    qty: input.qty,
    uom: catalogItem.uom,
    list_price: catalogItem.listPrice,
    discount_factor: catalogItem.discountFactor,
    unit_cost: unitCost,
    total_cost: totalCost,
    margin,
    quote_price: quotePrice,
    created_at: now
  })

  return getQuotationLineById(id) as QuotationLine
}

export async function addQuotationLineWithNewCatalogItem(
  quotationId: string,
  catalogInput: NewCatalogItemInput,
  input: AddQuotationLineInput,
  margin: number
): Promise<QuotationLine> {
  const catalogItem = await addCatalogItem(catalogInput)
  return addQuotationLine(quotationId, catalogItem.id, input, margin)
}

export function removeQuotationLine(lineId: string): void {
  const current = getQuotationLineById(lineId)
  if (!current) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

  getDb()
    .prepare('UPDATE quotation_lines SET removed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), lineId)
}
```

`NewCatalogItemInput` needs to be added to the existing `@shared/types/entities` import at the top of the file (it currently imports `CatalogItem, Quotation, QuotationLine, QuotationStatus, QuotationLineMatchStatus` — add `NewCatalogItemInput` to that list).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run --config vitest.electron.config.ts src/main/db/repositories/quotationsRepo.dbtest.ts`
Expected: PASS.

- [ ] **Step 5: Run the full DB test suite (regression check)**

Run: `npm run test:db`
Expected: PASS — this touches `getLinesForQuotation`, used by every other quotation dbtest indirectly.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/entities.ts src/main/db/repositories/quotationsRepo.ts src/main/db/repositories/quotationsRepo.dbtest.ts
git commit -m "feat: add repo functions for manually adding and removing quotation lines"
```

---

### Task 3: IPC layer — channels, handlers, preload bridge

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/quotations.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `addQuotationLine`, `addQuotationLineWithNewCatalogItem`, `removeQuotationLine`, `type AddQuotationLineInput` (Task 2); `getSettings` from `../settings/settingsStore`; `listFlagsByQuotation`, `resolveFlag` from `../db/repositories/flagsRepo`.
- Produces: `IPC.quotationLinesAdd`, `IPC.quotationLinesAddWithNewCatalogItem`, `IPC.quotationLinesRemove`; `window.api.quotations.addLine`, `.addLineWithNewCatalogItem`, `.removeLine`.

- [ ] **Step 1: Add IPC channel names**

In `src/shared/types/ipc-contract.ts`, add after `quotationPanelsUpdateMargin: 'quotationPanels:updateMargin',`:

```ts
  quotationLinesAdd: 'quotationLines:add',
  quotationLinesAddWithNewCatalogItem: 'quotationLines:addWithNewCatalogItem',
  quotationLinesRemove: 'quotationLines:remove',
```

- [ ] **Step 2: Add IPC handlers**

In `src/main/ipc/quotations.ipc.ts`, update the `../db/repositories/quotationsRepo` import to add the three new functions and the `AddQuotationLineInput` type:

```ts
import {
  createQuotationWithLines,
  getLatestQuotationForSld,
  getQuotationById,
  getQuotationLineById,
  listQuotationsByProject,
  setQuotationExcelPath,
  approveQuotation,
  rejectQuotation,
  deleteQuotation,
  updateQuotationLineMargin,
  updatePanelMargin,
  addQuotationLine,
  addQuotationLineWithNewCatalogItem,
  removeQuotationLine,
  type QuotationLineInput,
  type AddQuotationLineInput
} from '../db/repositories/quotationsRepo'
```

Update the `../db/repositories/flagsRepo` import (currently only `createFlags` is imported) to also bring in `listFlagsByQuotation` and `resolveFlag`:

```ts
import { createFlags, listFlagsByQuotation, resolveFlag, type CreateFlagInput } from '../db/repositories/flagsRepo'
```

Add `NewCatalogItemInput` and `QuotationLine` to the existing `@shared/types/entities` type import (currently `AnnotationBoundingBox, Quotation, QuotationComment`).

Add near the end of `registerQuotationsIpc()`, after the `quotationPanelsUpdateMargin` handler and before the closing `}`:

```ts
  safeHandle(
    IPC.quotationLinesAdd,
    (
      _event,
      quotationId: string,
      catalogItemId: string,
      input: AddQuotationLineInput
    ): QuotationLine => {
      const { defaultMargin } = getSettings()
      return addQuotationLine(quotationId, catalogItemId, input, defaultMargin)
    }
  )

  safeHandle(
    IPC.quotationLinesAddWithNewCatalogItem,
    async (
      _event,
      quotationId: string,
      catalogInput: NewCatalogItemInput,
      input: AddQuotationLineInput
    ): Promise<QuotationLine> => {
      const { defaultMargin } = getSettings()
      return addQuotationLineWithNewCatalogItem(quotationId, catalogInput, input, defaultMargin)
    }
  )

  safeHandle(IPC.quotationLinesRemove, (_event, lineId: string): void => {
    const line = getQuotationLineById(lineId)
    if (!line) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

    const openFlagsForLine = listFlagsByQuotation(line.quotationId).filter(
      (f) => f.status === 'open' && f.quotationLineId === lineId
    )
    for (const flag of openFlagsForLine) {
      resolveFlag(flag.id, 'Line removed from BOM')
    }

    removeQuotationLine(lineId)
  })
```

`getSettings` is already imported in this file (used by `quotationsGenerate`). `getQuotationLineById` needs adding to the `quotationsRepo` import list above (it's already exported by that file, just not currently imported here).

- [ ] **Step 3: Add the preload bridge**

In `src/preload/index.ts`, inside the `quotations: { ... }` object, add after `updatePanelMargin`:

```ts
    addLine: (
      quotationId: string,
      catalogItemId: string,
      input: AddQuotationLineInput
    ): Promise<QuotationLine> =>
      ipcRenderer.invoke(IPC.quotationLinesAdd, quotationId, catalogItemId, input),
    addLineWithNewCatalogItem: (
      quotationId: string,
      catalogInput: NewCatalogItemInput,
      input: AddQuotationLineInput
    ): Promise<QuotationLine> =>
      ipcRenderer.invoke(
        IPC.quotationLinesAddWithNewCatalogItem,
        quotationId,
        catalogInput,
        input
      ),
    removeLine: (lineId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.quotationLinesRemove, lineId)
```

`AddQuotationLineInput` was already added to `@shared/types/entities.ts` in Task 2 (preload can only import from `@shared/types/*`, never from `src/main` — that's why it lives there and not in `quotationsRepo.ts`). Add `AddQuotationLineInput` to `preload/index.ts`'s existing `@shared/types/entities` type import list — check the existing import line at the top of the file and extend it (`QuotationLine`/`NewCatalogItemInput` are likely already imported there for the existing `flags`/`quotations` methods; add `AddQuotationLineInput` alongside them).

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npm run test:all`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/quotations.ipc.ts src/preload/index.ts
git commit -m "feat: expose quotation-line add/remove over IPC"
```

---

### Task 4: Extract shared `CatalogItemPicker` from `CatalogResolveModal`

**Files:**
- Create: `src/renderer/src/components/quotation/CatalogItemPicker.tsx`
- Modify: `src/renderer/src/components/quotation/CatalogResolveModal.tsx`

**Interfaces:**
- Produces: `CatalogItemPicker` component and its exported `Step` type (`'search' | 'add'`), for reuse by `AddLineModal` (Task 5).
- `CatalogResolveModal`'s external props/behavior are unchanged — this is a pure internal refactor, verified by no behavior change when live-tested.

This task must not change what `CatalogResolveModal` does from a user's perspective — only where the UI code lives. No automated test exists for this component (matches this codebase's convention), so correctness here rests on a careful read of the diff plus live verification in Task 7.

- [ ] **Step 1: Create `CatalogItemPicker.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { useCatalogSearch } from '@renderer/state/queries/useCatalog'
import { currencySymbol } from '@shared/constants/currencies'
import { convertFromBase, convertToBase } from '@shared/lib/currencyConversion'
import type { CatalogItem, NewCatalogItemInput } from '@shared/types/entities'

export type Step = 'search' | 'add'

interface CatalogItemPickerProps {
  isOpen: boolean
  step: Step
  onStepChange: (step: Step) => void
  initialQuery: string
  initialDescriptionForNewItem: string
  initialUomForNewItem: string
  exchangeRate: number
  currency: string
  onPickExisting: (item: CatalogItem) => void
  onSubmitNew: (input: NewCatalogItemInput) => void
  pickPending: boolean
  submitPending: boolean
  pickErrorMessage?: string
  submitErrorMessage?: string
  onCancel: () => void
}

function emptyForm(description: string, uom: string): NewCatalogItemInput {
  return {
    sku: '',
    description,
    maker: '',
    family: '',
    series: '',
    listPrice: 0,
    discountFactor: 1,
    unitPrice: 0,
    uom
  }
}

export function CatalogItemPicker({
  isOpen,
  step,
  onStepChange,
  initialQuery,
  initialDescriptionForNewItem,
  initialUomForNewItem,
  exchangeRate,
  currency,
  onPickExisting,
  onSubmitNew,
  pickPending,
  submitPending,
  pickErrorMessage,
  submitErrorMessage,
  onCancel
}: CatalogItemPickerProps): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [form, setForm] = useState<NewCatalogItemInput>(() =>
    emptyForm(initialDescriptionForNewItem, initialUomForNewItem)
  )

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timeout)
  }, [query])

  const { data: results = [], isFetching } = useCatalogSearch(debouncedQuery, isOpen && step === 'search')

  const handleAddSubmit = (): void => {
    if (!form.sku.trim() || !form.description.trim()) return
    onSubmitNew({
      ...form,
      listPrice: convertToBase(form.listPrice ?? 0, exchangeRate),
      unitPrice: convertToBase(form.unitPrice ?? 0, exchangeRate)
    })
  }

  return step === 'search' ? (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU, description, maker…"
          className="pl-8"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">SKU</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Maker</th>
              <th className="px-2 py-1.5 text-right font-medium">Unit Price</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {results.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-2 py-1 font-mono text-text-secondary">{item.sku}</td>
                <td className="max-w-40 truncate px-2 py-1 text-text-primary" title={item.description}>
                  {item.description}
                </td>
                <td className="px-2 py-1 text-text-secondary">{item.maker}</td>
                <td className="px-2 py-1 text-right text-text-primary">
                  {currency}
                  {convertFromBase(item.unitPrice, exchangeRate).toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPickExisting(item)}
                    disabled={pickPending}
                  >
                    Use
                  </Button>
                </td>
              </tr>
            ))}
            {results.length === 0 && !isFetching && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-text-muted">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pickErrorMessage && (
        <div className="text-xs text-danger">
          <ErrorMessage message={pickErrorMessage} />
        </div>
      )}
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="accent" size="sm" onClick={() => onStepChange('add')}>
          Not in catalog — add it
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="SKU / Type *">
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </Field>
        <Field label="UOM">
          <Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
        </Field>
      </div>
      <Field label="Description *">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Maker">
          <Input value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} />
        </Field>
        <Field label="Family">
          <Input value={form.family} onChange={(e) => setForm({ ...form, family: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Series">
          <Input value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} />
        </Field>
        <Field label="Discount factor">
          <Input
            type="number"
            step="0.01"
            value={form.discountFactor}
            onChange={(e) => setForm({ ...form, discountFactor: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`List price (${currency})`}>
          <Input
            type="number"
            step="0.01"
            value={form.listPrice}
            onChange={(e) => setForm({ ...form, listPrice: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Unit price (cost) * (${currency})`}>
          <Input
            type="number"
            step="0.01"
            value={form.unitPrice}
            onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
          />
        </Field>
      </div>
      {submitErrorMessage && (
        <div className="text-xs text-danger">
          <ErrorMessage message={submitErrorMessage} />
        </div>
      )}
      <div className="mt-2 flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => onStepChange('search')}>
          Back to search
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleAddSubmit}
            disabled={submitPending || !form.sku.trim() || !form.description.trim()}
          >
            Add & match
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      {children}
    </label>
  )
}
```

Note: `currencySymbol` import was in the original file but is no longer used directly inside the picker (the caller passes the already-formatted `currency` string) — it's intentionally not imported here to avoid an unused-import lint error.

- [ ] **Step 2: Replace `CatalogResolveModal.tsx` to delegate to the picker**

Replace the full contents of `src/renderer/src/components/quotation/CatalogResolveModal.tsx`:

```tsx
import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { CatalogItemPicker, type Step } from '@renderer/components/quotation/CatalogItemPicker'
import {
  useAddCatalogItemAndLink,
  useLinkLineToCatalogItem
} from '@renderer/state/queries/useFlags'
import { useProjects } from '@renderer/state/queries/useProjects'
import { currencySymbol } from '@shared/constants/currencies'
import type { CatalogItem, NewCatalogItemInput, QuotationLine } from '@shared/types/entities'

interface CatalogResolveModalProps {
  open: boolean
  onClose: () => void
  flagId: string | null
  quotationId: string
  sldId: string
  projectId: string
  line: QuotationLine
}

export function CatalogResolveModal({
  open,
  onClose,
  flagId,
  quotationId,
  sldId,
  projectId,
  line
}: CatalogResolveModalProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('search')
  const linkItem = useLinkLineToCatalogItem()
  const addAndLink = useAddCatalogItemAndLink()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === projectId)
  const exchangeRate = project?.exchangeRate ?? 1
  const currency = currencySymbol(project?.currency ?? 'MYR')

  const ctx = { flagId, quotationId, sldId, projectId }

  const handlePick = (item: CatalogItem): void => {
    linkItem.mutate({ ...ctx, lineId: line.id, catalogItemId: item.id }, { onSuccess: onClose })
  }

  const handleSubmitNew = (input: NewCatalogItemInput): void => {
    addAndLink.mutate({ ...ctx, lineId: line.id, input }, { onSuccess: onClose })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Find catalog item' : 'Add to catalog'}
      className="w-[560px] max-w-[90vw]"
    >
      <CatalogItemPicker
        isOpen={open}
        step={step}
        onStepChange={setStep}
        initialQuery={line.description}
        initialDescriptionForNewItem={line.description}
        initialUomForNewItem={line.uom}
        exchangeRate={exchangeRate}
        currency={currency}
        onPickExisting={handlePick}
        onSubmitNew={handleSubmitNew}
        pickPending={linkItem.isPending}
        submitPending={addAndLink.isPending}
        pickErrorMessage={linkItem.error?.message}
        submitErrorMessage={addAndLink.error?.message}
        onCancel={onClose}
      />
    </Modal>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/quotation/CatalogItemPicker.tsx src/renderer/src/components/quotation/CatalogResolveModal.tsx
git commit -m "refactor: extract CatalogItemPicker from CatalogResolveModal"
```

---

### Task 5: `AddLineModal` and "Add line" button

**Files:**
- Create: `src/renderer/src/components/quotation/AddLineModal.tsx`
- Modify: `src/renderer/src/state/queries/useQuotation.ts`
- Modify: `src/renderer/src/components/quotation/QuotationTable.tsx`

**Interfaces:**
- Consumes: `CatalogItemPicker`/`Step` (Task 4); `window.api.quotations.addLine`/`.addLineWithNewCatalogItem` (Task 3).
- Produces: `useAddQuotationLine()`, `useAddQuotationLineWithNewCatalogItem()` hooks; `AddLineModal` component; "Add line" button in `QuotationTable`'s header.

- [ ] **Step 1: Add the mutation hooks**

In `src/renderer/src/state/queries/useQuotation.ts`, add after `useUpdatePanelMargin`:

```ts
export function useAddQuotationLine(): UseMutationResult<
  QuotationLine,
  Error,
  { quotationId: string; catalogItemId: string; input: AddQuotationLineInput; sldId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, catalogItemId, input }) =>
      window.api.quotations.addLine(quotationId, catalogItemId, input),
    onSuccess: (_line, { sldId }) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
    }
  })
}

export function useAddQuotationLineWithNewCatalogItem(): UseMutationResult<
  QuotationLine,
  Error,
  {
    quotationId: string
    catalogInput: NewCatalogItemInput
    input: AddQuotationLineInput
    sldId: string
  }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, catalogInput, input }) =>
      window.api.quotations.addLineWithNewCatalogItem(quotationId, catalogInput, input),
    onSuccess: (_line, { sldId }) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
      queryClient.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}
```

Update the file's top-level type import to add `AddQuotationLineInput`, `NewCatalogItemInput`, `QuotationLine`:

```ts
import type {
  AddQuotationLineInput,
  NewCatalogItemInput,
  Quotation,
  QuotationComment,
  QuotationLine
} from '@shared/types/entities'
```

- [ ] **Step 2: Create `AddLineModal.tsx`**

```tsx
import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { CatalogItemPicker, type Step } from '@renderer/components/quotation/CatalogItemPicker'
import {
  useAddQuotationLine,
  useAddQuotationLineWithNewCatalogItem
} from '@renderer/state/queries/useQuotation'
import { useProjects } from '@renderer/state/queries/useProjects'
import { currencySymbol } from '@shared/constants/currencies'
import type { CatalogItem, NewCatalogItemInput } from '@shared/types/entities'

interface AddLineModalProps {
  open: boolean
  onClose: () => void
  quotationId: string
  sldId: string
  projectId: string
  panelNames: string[]
  initialPageNumber: number | null
  initialPanelName: string | null
}

export function AddLineModal({
  open,
  onClose,
  quotationId,
  sldId,
  projectId,
  panelNames,
  initialPageNumber,
  initialPanelName
}: AddLineModalProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('search')
  const [pageNumber, setPageNumber] = useState(initialPageNumber ?? 1)
  const [panelName, setPanelName] = useState(initialPanelName ?? panelNames[0] ?? '')
  const [qty, setQty] = useState(1)

  const addLine = useAddQuotationLine()
  const addLineWithNewCatalogItem = useAddQuotationLineWithNewCatalogItem()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === projectId)
  const exchangeRate = project?.exchangeRate ?? 1
  const currency = currencySymbol(project?.currency ?? 'MYR')

  const lineInput = { pageNumber, panelName, qty }

  const handlePick = (item: CatalogItem): void => {
    addLine.mutate(
      { quotationId, catalogItemId: item.id, input: lineInput, sldId },
      { onSuccess: onClose }
    )
  }

  const handleSubmitNew = (input: NewCatalogItemInput): void => {
    addLineWithNewCatalogItem.mutate(
      { quotationId, catalogInput: input, input: lineInput, sldId },
      { onSuccess: onClose }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Add line — find catalog item' : 'Add line — add to catalog'}
      className="w-[560px] max-w-[90vw]"
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Page
          <Input
            type="number"
            min={1}
            value={pageNumber}
            onChange={(e) => setPageNumber(Number(e.target.value))}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-muted">
          Panel
          <Input value={panelName} onChange={(e) => setPanelName(e.target.value)} list="add-line-panel-names" />
          <datalist id="add-line-panel-names">
            {panelNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Qty
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
      </div>
      <CatalogItemPicker
        isOpen={open}
        step={step}
        onStepChange={setStep}
        initialQuery=""
        initialDescriptionForNewItem=""
        initialUomForNewItem=""
        exchangeRate={exchangeRate}
        currency={currency}
        onPickExisting={handlePick}
        onSubmitNew={handleSubmitNew}
        pickPending={addLine.isPending}
        submitPending={addLineWithNewCatalogItem.isPending}
        pickErrorMessage={addLine.error?.message}
        submitErrorMessage={addLineWithNewCatalogItem.error?.message}
        onCancel={onClose}
      />
    </Modal>
  )
}
```

- [ ] **Step 3: Wire the "Add line" button into `QuotationTable.tsx`**

Add to the imports:

```ts
import { Plus } from 'lucide-react'
import { AddLineModal } from '@renderer/components/quotation/AddLineModal'
```

(merge `Plus` into the existing `lucide-react` import line, which currently reads `import { Flag as FlagIcon, Loader2, Sparkles } from 'lucide-react'`.)

Add new state near the existing `resolveLine`/`confidenceLine` state:

```ts
  const [addLineOpen, setAddLineOpen] = useState(false)
```

In the header toolbar `<div className="flex items-center gap-3 text-xs">...</div>` block's sibling `<Button variant="outline" ...>Re-generate</Button>`, wrap both buttons in a `<div className="flex gap-2">` and add the new button before "Re-generate":

```tsx
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddLineOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate.mutate(sldId)}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Re-generate
          </Button>
        </div>
```

(This replaces the standalone `<Button ... >Re-generate</Button>` currently there — same button, now alongside the new one inside a flex wrapper.)

Add the modal render, alongside the existing `resolveLine`/`confidenceLine` modals near the end of the JSX, before the closing `</div>`:

```tsx
      {addLineOpen && (
        <AddLineModal
          open
          onClose={() => setAddLineOpen(false)}
          quotationId={quotation.id}
          sldId={sldId}
          projectId={projectId}
          panelNames={panelNames}
          initialPageNumber={activeTab === FULL_BOM_TAB ? null : visibleLines[0]?.pageNumber ?? null}
          initialPanelName={activeTab === FULL_BOM_TAB ? null : activeTab}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/quotation/AddLineModal.tsx src/renderer/src/state/queries/useQuotation.ts src/renderer/src/components/quotation/QuotationTable.tsx
git commit -m "feat: add manual BOM line creation (AddLineModal + Add line button)"
```

---

### Task 6: Remove button per row

**Files:**
- Modify: `src/renderer/src/state/queries/useQuotation.ts`
- Modify: `src/renderer/src/components/quotation/QuotationTable.tsx`

**Interfaces:**
- Consumes: `window.api.quotations.removeLine` (Task 3).
- Produces: `useRemoveQuotationLine()` hook; a remove icon button per BOM row.

- [ ] **Step 1: Add the mutation hook**

In `src/renderer/src/state/queries/useQuotation.ts`, add after `useAddQuotationLineWithNewCatalogItem`:

```ts
export function useRemoveQuotationLine(): UseMutationResult<
  void,
  Error,
  { lineId: string; sldId: string; projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId }) => window.api.quotations.removeLine(lineId),
    onSuccess: (_data, { sldId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(projectId) })
    }
  })
}
```

(`openFlagCountsQueryKey` is already imported in this file from `./useFlags`, used by `useDeleteQuotation` — reuse it here since removing a line can close flags, changing the open-flag count.)

- [ ] **Step 2: Wire the remove button into `QuotationTable.tsx`**

Add to the `lucide-react` import (merge into the existing line, now including `Plus` from Task 5): add `Trash2`.

Add the hook and a table-cell handler near the top of the component body, alongside the other mutation hooks:

```ts
  const removeLine = useRemoveQuotationLine()

  const handleRemoveLine = (e: React.MouseEvent, line: QuotationLine): void => {
    e.stopPropagation()
    if (!window.confirm(`Remove "${line.description}" from the BOM?`)) return
    removeLine.mutate({ lineId: line.id, sldId, projectId })
  }
```

Add `useRemoveQuotationLine` to the `@renderer/state/queries/useQuotation` import list at the top of the file.

Add a new table header cell after the existing `<th className="px-3 py-2 font-medium">Quote</th>`:

```tsx
                <th className="px-3 py-2" />
```

Add a matching cell inside each row's `<tr>`, after the existing Quote `<td>`:

```tsx
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => handleRemoveLine(e, line)}
                      title="Remove from BOM"
                      className="rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger-bg hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
```

The row `<tr>` needs `group` added to its existing `className` (currently built via `cn(...)`) so the button's `group-hover:opacity-100` works — add `'group'` as one of the classes passed to that `cn(...)` call.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/state/queries/useQuotation.ts src/renderer/src/components/quotation/QuotationTable.tsx
git commit -m "feat: add per-row remove-from-BOM button"
```

---

### Task 7: Full regression and live verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run: `npm run test:all`
Expected: PASS (both Node and Electron/DB suites).

- [ ] **Step 2: Build and launch check**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`
Expected: launches without a startup crash.

- [ ] **Step 3: Live verification (cannot be automated — ask the user)**

Ask the user to, in the running app, on a real quotation:

1. Click "Add line", search for an existing catalog item, and confirm a new BOM line appears with correct page/panel/qty/pricing and the BOM total updates.
2. Click "Add line" again, use "Not in catalog — add it" to create a brand-new catalog item, and confirm both the new line appears correctly **and** the item is now findable via the existing unmatched-line resolve flow (confirms `addCatalogItemAndLink`'s sibling function wrote the catalog item correctly).
3. Confirm the original `CatalogResolveModal` (double-clicking an unmatched/low-confidence AI line) still works exactly as before — this is the regression risk from Task 4's refactor.
4. Remove a line and confirm it disappears from the table and the BOM total updates.
5. Remove a line that has an open flag (an unmatched or low-confidence AI line) and confirm that flag's badge/count also clears.
6. Re-export to Excel and confirm the removed line is absent and the added line(s) are present with correct values.

- [ ] **Step 4: Update project memory**

Once the user confirms results, update the `project-post-beta-feedback-backlog` memory to mark this item done, and note anything unexpected surfaced during live verification.
