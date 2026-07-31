# Project Details — Design Spec

**Date:** 2026-07-31
**Status:** Approved

## Problem

Projects currently only have `name` and `substationLabel`. The user wants richer project metadata for tracking real enquiries/quotations against a client: which industry sector, which company, who's coordinating it, a project-level status, an auto-generated reference number, and a record of who created it and when — visible in-app and on the exported quotation Excel as a cover page.

## Scope

New project metadata fields, a Details modal to view/edit them, two new user-configurable dropdown-option lists (sector, company) in Settings, and a new cover sheet on every exported quotation workbook. Not in scope: multi-user coordinator assignment (the app is single-user; "Coordinator" is a free-text field, not tied to an account), any per-quotation (as opposed to per-project) metadata, and any change to the existing `QuotationStatus` used by individual SLD quotations (the new project-level status is independent and manually set, not derived from quotation statuses).

## Data model

- **Reused, not duplicated**: "Project Title" is the existing `Project.name`. "Enquiry Date" is the existing `Project.createdAt`. Neither gets a new column.
- **New migration** `0024_project_details.ts` adds to `projects`:
  - `sector TEXT NULL`
  - `quotation_number TEXT NOT NULL DEFAULT ''` (backfilled per-row at migration time — see below)
  - `company TEXT NULL`
  - `coordinator TEXT NULL`
  - `status TEXT NOT NULL DEFAULT 'pending_review'`
  - `created_by TEXT NULL`
- **Quotation number generation**: format `PRJ-0001`, `PRJ-0002`, ... . Computed at project-creation time by reading the existing project with the numerically-highest `quotation_number` suffix and incrementing (not a separately stored counter) — self-contained in the `projects` table, no new state file. Safe against gaps/reuse because there is no project-delete feature today (see memory `project_remaining_stages_roadmap`, item 3 spec note); if delete is ever added later, this scheme would need revisiting, but that's out of scope here.
  - **Migration backfill**: existing rows (created before this migration) get `quotation_number` assigned in `created_at` order (oldest first) so the numbering is stable and non-overlapping with new projects created after the migration runs.
- **`status`** reuses the exact same 4 values as `QuotationStatus` (`'generating' | 'pending_review' | 'approved' | 'rejected'`) for label/tone consistency (`src/renderer/src/lib/statusMeta.ts`'s existing `quotationStatusMeta` is reused for display), but is a fully independent, manually-set field — not derived from any quotation's status. Default `'pending_review'` (not `'generating'`, since nothing auto-generates a freshly created project).
- **`created_by`**: the current session's username, captured once at project-creation time via the existing `getCurrentUserId()` (`src/main/auth/authState.ts`) + `getUserById()` (`src/main/db/repositories/usersRepo.ts`). Never changes after creation — not exposed as editable in the Details modal.
- **`coordinator`**: free text, pre-filled with the current username at creation time (same lookup as `created_by`) but freely editable afterward to any string, since the actual coordinator on a real job may not be an app user.
- **Settings additions** (`AppSettings` in the existing JSON-file settings store, `src/main/settings/settingsStore.ts` — no DB migration involved): `projectSectors: string[]` (seeded with `['Data Centre', 'Industrial', 'Infrastructure', 'Renewable Energy', 'Semiconductor']`) and `companies: string[]` (seeded `[]`). Both are plain user-owned lists — add/remove any entry, including the seeded defaults — unlike the existing "Components" settings pattern, there's no separate catalog-derived enable/disable concept here.

## UI

- **`CreateProjectDialog`**: gains three new optional fields — Sector (`<select>` sourced from `settings.projectSectors`, empty/blank option first), Company (`<select>` sourced from `settings.companies`, same), Coordinator (text input, defaults to the current username, editable). `name` stays the only required field, matching today's minimal-friction flow. `quotationNumber`, `status`, and `createdBy` are computed server-side in the `projects:create` handler, not exposed on the creation form.
- **New `ProjectDetailsModal`** (`src/renderer/src/components/layout/ProjectDetailsModal.tsx`), opened by a new "Details" button in `TopBar` (next to the existing Catalog button, same `outline` `Button` styling). Shows and edits all 8 fields for the active project: Title (editable — updates `project.name`), Sector (dropdown), Quotation # (read-only), Company (dropdown), Coordinator (editable text), Status (dropdown, `quotationStatusMeta`'s 4 labels), Enquiry Date (read-only, formatted `createdAt`), Created by (read-only, or "—" if null for projects created before this feature).
- All five editable fields (name, sector, company, coordinator, status) share **one** combined update path rather than five separate single-field ones (unlike the earlier currency/AI-model-override features, which each only ever had one editable value at a time): a single `updateProjectDetails(id, patch: Partial<{ name, sector, company, coordinator, status }>)` repo function, one `projects:updateDetails` IPC endpoint, one `useUpdateProjectDetails()` renderer hook. The modal calls it per-field on blur/change (each field edit sends just that one key in the patch), same UX as the other inline-editable project settings elsewhere in the app.
- **Two new Settings sections**, `ProjectSectorsSection` and `CompaniesSection`, added to `SettingsPage`'s nav list. Each is a simple add/remove text-list editor: a text input + "Add" button, and each existing entry shown with a small × remove button — the same interaction shape as the "Custom types" sub-block already in `ComponentsSection.tsx`, minus its checkbox/brand-select complexity (there's no "catalog of all possible sectors" to check against here, the list itself *is* the option set).

## Excel export

`writeQuotationWorkbook` (`src/main/quotation/quotationExcelBuilder.ts`) gains one new worksheet, added **before** the existing "Full BOM" sheet so it's the first tab and the default active sheet when the file opens. It's a plain label/value cover page reusing the same header-block styling already used at the top of `writeBomSheet` (bold merged title cell, then label/value rows) — Title, Sector, Quotation #, Company, Coordinator, Status, Enquiry Date, Created by, each on its own row. Since `writeQuotationWorkbook` is the single function shared by both the per-quotation "Export quotation" button (`quotations.ipc.ts`) and the full-project export bundle (`projectExporter.ts`), the cover sheet appears automatically on every exported quotation file without touching either call site.

## Error handling

None beyond the existing mutation patterns already used elsewhere (currency, AI model override) — these are low-stakes metadata edits, not validated business operations. The one exception: quotation-number generation must not collide even under (unlikely, single-user, local-DB) concurrent creation — reading-then-incrementing inside the same synchronous `better-sqlite3` transaction as the insert avoids a race, since better-sqlite3 operations on a single connection are inherently serialized.

## Testing

- New/extended `projectsRepo.dbtest.ts` cases: quotation-number sequencing (`PRJ-0001` then `PRJ-0002` on successive creates), migration backfill assigns sequential numbers in `created_at` order to pre-existing rows, `status` defaults to `pending_review`, `coordinator`/`created_by` populated from the provided username at creation.
- Manual/live verification (no renderer test infra exists — same constraint noted in the two prior roadmap items): create a project, confirm Details modal shows all 8 fields with correct defaults; edit sector/company/coordinator/status and confirm they persist; add/remove entries in the two new Settings lists and confirm the Create/Details dropdowns reflect the change; export a quotation and confirm the cover sheet is the first tab with the correct values.
