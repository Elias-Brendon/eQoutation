# Manual BOM Add/Remove — Design

**Date:** 2026-08-05
**Status:** Approved
**Context:** Part of the post-beta feedback backlog (`project_post_beta_feedback_backlog` memory). Today `quotation_lines` only come from AI extraction — there's no way to add a component the AI missed or remove one that shouldn't be in the BOM, short of re-running extraction. This is the second item picked off that backlog, after the annotation-toggle-off bug fix.

## Goal

Let a user add a component to a quotation's BOM manually, and remove a line that shouldn't be there — without needing a fresh AI extraction.

## Data model

New nullable `removed_at TEXT` column on `quotation_lines` (migration, plain `ALTER TABLE` following this project's existing migration pattern). `getLinesForQuotation()` in `quotationsRepo.ts` — the single query every consumer of `Quotation.lines` goes through (`quotationExcelBuilder.ts`, `QuotationTable.tsx`, `CenterPanel.tsx`) — gains one clause: `WHERE quotation_id = ? AND removed_at IS NULL`. Because everything reads through that one function, a removed line disappears from the BOM, totals, and Excel export everywhere at once, with no other call site needing to know soft-delete exists.

**Remove is a soft delete, not a hard delete.** This app already treats AI-authored annotations as a permanent training-data record; a human removing an AI-extracted line (and why) is the same kind of signal worth keeping, not throwing away. `getQuotationLineById` is intentionally left unfiltered by `removed_at` — it's a low-level lookup used by other flows (flag resolution, etc.) that shouldn't silently start returning null for a line that still exists, just hidden from the BOM view.

**Add requires a catalog item** — no free-text/unmatched manual lines. A manually-added line always has real pricing from the start, the same as a matched AI line, via the existing search-catalog-or-add-new-catalog-item flow already built for resolving unmatched AI lines.

## Backend

`quotationsRepo.ts` gains three functions:

```ts
export interface AddQuotationLineInput {
  pageNumber: number
  panelName: string
  qty: number
}

export function addQuotationLine(
  quotationId: string,
  catalogItemId: string,
  input: AddQuotationLineInput
): QuotationLine

export function addQuotationLineWithNewCatalogItem(
  quotationId: string,
  catalogInput: NewCatalogItemInput,
  input: AddQuotationLineInput
): QuotationLine

export function removeQuotationLine(lineId: string): void
```

`addQuotationLine` looks up the catalog item via `getCatalogItemById` (throws `DB_CATALOG_ITEM_NOT_FOUND` if missing), then inserts a new row using the same pricing math `applyLineMatch`/quotation-generation already use: `unitCost = catalogItem.unitPrice`, `totalCost = qty * unitCost`, `margin = settings.defaultMargin`, `quotePrice = totalCost * margin`. Field defaults: `matchStatus: 'matched'`, `matchConfidence: 1` (a human pick, not a guess), `aiConfidence: 1` (so it never trips the low-confidence badge/flag logic meant for actual AI extractions), `tag: ''` (no UI in this feature to set it — out of scope).

`addQuotationLineWithNewCatalogItem` mirrors the existing `addCatalogItemAndLink` pattern (create the catalog item, then attach it, in one transaction) — except it creates a brand-new line instead of linking an existing one, since there's no existing line yet on the add path. This keeps the "search existing → use it" vs. "create new → use it" split symmetric with how `useLinkLineToCatalogItem` vs. `useAddCatalogItemAndLink` already work for resolving unmatched lines.

`removeQuotationLine` sets `removed_at = now()`, throwing `DB_QUOTATION_LINE_NOT_FOUND` if the line doesn't exist (matches `updateQuotationLine`/`applyLineMatch`'s existing not-found convention). Calling it twice on an already-removed line is harmless — it just re-sets the same kind of timestamp, no special-cased idempotency check needed.

### IPC

New channels in `quotations.ipc.ts`, following the existing `quotationLines:*` namespace:

```ts
quotationLinesAdd: 'quotationLines:add'
quotationLinesAddWithNewCatalogItem: 'quotationLines:addWithNewCatalogItem'
quotationLinesRemove: 'quotationLines:remove'
```

All three wrapped in `safeHandle`, matching every other quotation-line endpoint.

**Related-flags cleanup, handled at the IPC layer (orchestration), not inside the repo function:** removing a line that has open flags (unmatched/low-confidence/human-raised) would otherwise leave those flags open forever, referencing a line the user can no longer see in the BOM — confusing, and inflates the open-flag count for no reason. The `quotationLines:remove` handler looks up the line's `quotationId` via `getQuotationLineById`, finds any open flags for that `lineId` via `listFlagsByQuotation`, and resolves each via the existing `resolveFlag(id, 'Line removed from BOM')` — reusing `flagsRepo`'s existing resolve function, no new flag logic. This mirrors how `quotationsGenerate`'s handler already orchestrates flags and lines together rather than pushing that coordination into the repo layer.

## Frontend

**Shared component extraction:** `CatalogResolveModal`'s search-and-add-new-catalog-item UI (search input + results table + "Not in catalog — add it" form) gets factored into a `CatalogItemPicker` component, parameterized by `onPickExisting(item: CatalogItem)` / `onSubmitNew(input: NewCatalogItemInput)` callbacks instead of being hardwired to the link-to-existing-line mutations. `CatalogResolveModal` keeps its current behavior exactly, just delegating its UI to the shared piece instead of owning it inline.

**New `AddLineModal`:** qty/page/panel fields, pre-filled from the currently active panel tab in `QuotationTable` when opened from a specific panel (blank/pick-from-existing-panels when opened from the "Full BOM" tab), shown alongside `CatalogItemPicker` and editable at any point before a catalog item is picked or created. Selecting an existing item or submitting a new one immediately creates the line using the field values at that moment:

```ts
useAddQuotationLine()                     // existing catalog item -> addQuotationLine
useAddQuotationLineWithNewCatalogItem()   // new catalog item -> addQuotationLineWithNewCatalogItem
```

Opened from a new "Add line" button in `QuotationTable`'s header toolbar, next to the existing "Re-generate" button.

**Remove:** a small icon button appended to each row, visible on row hover (matching the row's existing `hover:bg-surface-hover` treatment), `stopPropagation`'d so it doesn't also trigger the row's click-to-focus-PDF behavior. Click opens a native `window.confirm` (same pattern `handleMarkerClick` already uses for deleting a personal annotation) before calling `useRemoveQuotationLine()`.

## Testing

`quotationsRepo.dbtest.ts` (extended, following this project's existing dbtest convention) covers everything that's pure repo-layer behavior: `addQuotationLine` computes correct pricing from the catalog item and defaults `matchStatus`/`matchConfidence`/`aiConfidence` correctly; `addQuotationLineWithNewCatalogItem` creates the catalog item and the line in one call; `removeQuotationLine` sets `removed_at` and confirms `getLinesForQuotation`/`getQuotationById` exclude it afterward while `getQuotationLineById` still returns it; not-found errors for bad catalog-item/line ids.

The related-flags cleanup lives in the IPC handler, not a repo function (see Backend section) — like every other IPC handler in this codebase (`quotationsGenerate` included), the IPC layer itself is live-verified, not dbtest-covered. No renderer tests either — matches this codebase's existing convention of zero React component test coverage; the frontend is live-verified instead.

**Live verification (required, cannot be substituted):** add a line via both the search-existing and add-new-catalog-item paths, confirm it appears in the BOM with correct pricing and totals; remove a line, confirm it disappears from the table/totals and any open flag on it closes; re-export to Excel and confirm the removed line is absent and the added line is present.

## Out of scope

- Editing a manually-added line's tag (no UI surfaced for it in this feature; the field exists and defaults empty).
- Undoing a remove (soft-delete makes the data recoverable in principle, but no UI exposes restoring a removed line — a future feature if ever needed).
- Bulk add/remove (multi-select rows) — one line at a time only.
- Any change to how AI-extracted lines are created (`quotationsGenerate`'s flow) — this only adds new manual paths alongside it.
