# Delete Project — Design

**Date:** 2026-08-05
**Status:** Approved
**Context:** Part of the post-beta feedback backlog (`project_post_beta_feedback_backlog` memory). Explicitly scoped out when the project switcher was built ("no search/rename/delete... small project count, no existing delete/rename capability to build on") — the user now wants it. Third and final item worked from that backlog this session, after the annotation-toggle-off fix and manual BOM add/remove.

## Goal

Let a user permanently delete a project — every SLD, quotation, annotation, flag, and file under it — from the project switcher.

## Delete semantics

**Hard delete, not soft delete.** This codebase has two existing precedents: SLD delete is soft (a `deleted_at` column, nothing removed), quotation delete is hard (DB row + its Excel file actually removed). Project delete follows quotation delete's precedent — the DB already has a complete `ON DELETE CASCADE` chain from `projects` down through `slds` → `annotations`/`extractions`/`quotations` → `quotation_lines`/`flags`/`comments` → `feedback_log`/`confidence_feedback`, so removing the `projects` row is sufficient at the DB level with zero new cascade logic. Soft delete was considered and rejected — nothing in the app exposes restoring a soft-deleted project, and disk usage would only grow over time with no way to reclaim it.

**Confirmation:** a single `window.confirm`, matching the existing SLD/quotation delete pattern — not a type-the-name confirmation, per explicit user choice despite the larger blast radius.

## File cleanup

Both SLD PDFs and quotation Excel files already live under one shared parent directory: `userData/projects/<projectId>/{slds,quotations}/`. Deleting that parent directory recursively cleans up everything in one step — no need to track or iterate individual `file_path`/`excel_file_path` values.

New `src/main/storage/projectStorage.ts` (parallel to the existing `sldStorage.ts`):

```ts
export function deleteProjectFiles(projectId: string): void {
  const dir = join(app.getPath('userData'), 'projects', projectId)
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best-effort — matches deleteQuotationExcelFile's convention: a locked
    // file shouldn't block deleting the project record.
  }
}
```

## Backend

`projectsRepo.ts` gains:

```ts
export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}
```

New IPC channel `projectsDelete: 'projects:delete'`. Handler in `projects.ipc.ts`, orchestrated exactly like `quotationsDelete` — look up the project (404 via the existing `DB_PROJECT_NOT_FOUND` if missing), clean up files, then delete the row, in that order so a failed (best-effort) file cleanup never leaves the DB row gone with files still on disk in some half-state:

```ts
safeHandle(IPC.projectsDelete, (_event, projectId: string): void => {
  const project = getProjectById(projectId)
  if (!project) throw new AppError('DB_PROJECT_NOT_FOUND')
  deleteProjectFiles(projectId)
  deleteProject(projectId)
})
```

Preload gets `projects.delete(projectId: string): Promise<void>`.

## Frontend

`useUiStore` gains `clearProject(): void`, resetting `selectedProjectId`/`selectedSldId`/`selectedQuotationId` all to `null` — a project's SLD/quotation selections are meaningless once it's gone. The existing auto-select effect in `App.tsx` (`if (!selectedProjectId && projects.length > 0) selectProject(projects[0].id)`) then picks a new active project automatically once the projects list refetches; no new selection logic needed for that part.

`useDeleteProject()` hook mirrors `useDeleteQuotation()`, invalidating the `['projects']` query on success.

`ProjectSwitcherModal` gains an `onDeleteProject: (project: Project) => void` prop and a small delete icon per row — same `Trash2`/hover-reveal pattern (`opacity-0 group-hover:opacity-100`) already built for BOM lines. The modal stays a "dumb" list, delegating both select and delete upward via callback props, consistent with how it already delegates `onSelectProject`. The modal stays open after a delete — only closes on selecting a project or explicit close — so deleting several projects in a row doesn't require reopening it.

The confirm + mutate + clear-if-active orchestration lives in `App.tsx`, next to the existing `handleDeleteSld`/`handleDeleteQuotation`:

```ts
const handleDeleteProject = async (project: Project): Promise<void> => {
  const confirmed = window.confirm(
    `Delete project "${project.name}"? This permanently removes every SLD, quotation, and file in it — this can't be undone.`
  )
  if (!confirmed) return
  await deleteProject.mutateAsync(project.id)
  if (selectedProjectId === project.id) clearProject()
}
```

## Edge cases

- **Deleting the last remaining project:** `selectedProjectId` ends up `null`. The app is already null-safe throughout `App.tsx` (every consumer of `selectedProject` is either optional-chained or explicitly guarded) — no new empty-state UI required.
- **Deleting the currently-open project:** handled by the `clearProject()` call above; the auto-select effect re-picks a project once the list refetches.

## Testing

`projectsRepo.dbtest.ts` (extending the existing file) covers `deleteProject`: create a project with an SLD, a quotation, and a quotation line, delete the project, confirm every one of those rows is gone (proving the cascade fires end-to-end, not just that the `projects` row itself is removed).

`deleteProjectFiles` isn't dbtest-covered — real filesystem + `Electron app.getPath`, same reasoning as `addQuotationLineWithNewCatalogItem` in the previous feature (`addCatalogItem` writes a real `.xlsx` file). Covered by live verification instead.

No renderer tests — matches this codebase's existing convention; the frontend is live-verified.

**Live verification (required, cannot be substituted):** create a throwaway project with an SLD and a generated quotation, delete it from the switcher, confirm it disappears from the list and its files are gone from `userData/projects/<id>/`; confirm deleting the *currently open* project switches the view to another project correctly; confirm deleting the very last remaining project leaves the app in a sane (not broken) state.

## Out of scope

- Soft delete / restore / a "recycle bin" concept for projects.
- Type-the-name (or any stronger) confirmation — a single `window.confirm`, per explicit user choice.
- Bulk-delete (multi-select) — one project at a time only.
- Any change to how SLDs or quotations are individually deleted — this only adds a project-level delete alongside the existing ones.
