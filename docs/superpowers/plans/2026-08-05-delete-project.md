# Delete Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user permanently delete a project — every SLD, quotation, annotation, flag, and file under it — from the project switcher.

**Architecture:** A hard delete. The DB already has a complete `ON DELETE CASCADE` chain from `projects` down through everything, so `DELETE FROM projects WHERE id = ?` is sufficient at the DB level. Both SLD PDFs and quotation Excel files live under one shared parent directory (`userData/projects/<projectId>/`), so file cleanup is one recursive directory removal, best-effort. The IPC handler orchestrates: look up (404 if missing) → clean up files → delete the row. On the frontend, `ProjectSwitcherModal` gets a per-row delete button; `App.tsx` owns the confirm + mutate + clear-active-selection-if-needed logic, matching its existing `handleDeleteSld`/`handleDeleteQuotation` pattern.

**Tech Stack:** TypeScript, better-sqlite3, React, TanStack Query, Vitest (dbtest convention).

## Global Constraints

- Hard delete, not soft delete — matches `deleteQuotation`'s precedent, not `softDeleteSld`'s.
- Confirmation is a single `window.confirm`, not a type-the-name confirmation.
- File cleanup (`deleteProjectFiles`) is best-effort — a locked file must never block deleting the project record, matching `deleteQuotationExcelFile`'s existing convention.
- Cleanup order matters: files first, then the DB row — so a failed (best-effort) file cleanup never leaves the DB row gone with files still orphaned on disk in a state nothing can find again.
- `ProjectSwitcherModal` stays a "dumb" list — both select and delete are delegated to the parent via callback props, matching its existing `onSelectProject` pattern.
- The modal stays open after a delete (only closes on select or explicit close).
- No renderer tests — matches this codebase's existing convention; frontend changes are live-verified.

Every task's requirements implicitly include this section. Full rationale: `docs/superpowers/specs/2026-08-05-delete-project-design.md`.

---

### Task 1: Backend — file cleanup + repo delete function

**Files:**
- Create: `src/main/storage/projectStorage.ts`
- Modify: `src/main/db/repositories/projectsRepo.ts`
- Modify: `src/main/db/repositories/projectsRepo.dbtest.ts`

**Interfaces:**
- Produces: `deleteProjectFiles(projectId: string): void`; `deleteProject(id: string): void`.

- [ ] **Step 1: Create `projectStorage.ts`**

```ts
import { app } from 'electron'
import { rmSync } from 'fs'
import { join } from 'path'

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

No unit test for this function — it's real filesystem + `Electron app.getPath`, matching the existing convention that this class of function is live-verified only (Task 4).

- [ ] **Step 2: Write the failing test for `deleteProject`**

Add to `src/main/db/repositories/projectsRepo.dbtest.ts`, as a new `describe` block (after the existing `projectsRepo project details` block). This needs `getDb` for the raw SQL fixture inserts (slds/quotations/quotation_lines) — update the top import line:

```ts
import { closeDb, getDb } from '../index'
```

Then append:

```ts
describe('deleteProject', () => {
  it('cascades: deleting a project removes its slds, quotations, and quotation lines', () => {
    const project = createProject({ name: 'To Delete' })
    const db = getDb()
    const now = new Date().toISOString()

    const sldId = randomUUID()
    db.prepare(
      'INSERT INTO slds (id, project_id, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(sldId, project.id, 'test.pdf', now, now)

    const quotationId = randomUUID()
    db.prepare(
      "INSERT INTO quotations (id, sld_id, code, created_at, updated_at) VALUES (?, ?, 'Q-TEST', ?, ?)"
    ).run(quotationId, sldId, now, now)

    const lineId = randomUUID()
    db.prepare(
      `INSERT INTO quotation_lines
         (id, quotation_id, catalog_item_id, description, match_status, match_confidence, created_at)
       VALUES (?, ?, NULL, 'Test Line', 'matched', 1, ?)`
    ).run(lineId, quotationId, now)

    deleteProject(project.id)

    expect(getProjectById(project.id)).toBeNull()
    expect(db.prepare('SELECT * FROM slds WHERE id = ?').get(sldId)).toBeUndefined()
    expect(db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId)).toBeUndefined()
    expect(db.prepare('SELECT * FROM quotation_lines WHERE id = ?').get(lineId)).toBeUndefined()
  })

  it('is a no-op for a nonexistent project id (no throw)', () => {
    expect(() => deleteProject(randomUUID())).not.toThrow()
  })
})
```

This also needs `randomUUID` — add `import { randomUUID } from 'crypto'` at the top of the test file if not already present (check the current file; it currently has no such import since it only calls `createProject`/etc., not raw SQL).

Update the `./projectsRepo` import to add `deleteProject`:

```ts
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectDetails
} from './projectsRepo'
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run --config vitest.electron.config.ts src/main/db/repositories/projectsRepo.dbtest.ts`
Expected: FAIL — `deleteProject` not exported yet.

- [ ] **Step 4: Implement `deleteProject` in `projectsRepo.ts`**

Add at the end of the file:

```ts
export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run --config vitest.electron.config.ts src/main/db/repositories/projectsRepo.dbtest.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 6: Run the full DB test suite (regression check)**

Run: `npm run test:db`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/main/storage/projectStorage.ts src/main/db/repositories/projectsRepo.ts src/main/db/repositories/projectsRepo.dbtest.ts
git commit -m "feat: add project deletion (cascade DB delete + file cleanup)"
```

---

### Task 2: IPC + preload bridge

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/projects.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `deleteProject`, `getProjectById` from `../db/repositories/projectsRepo` (Task 1); `deleteProjectFiles` from `../storage/projectStorage` (Task 1).
- Produces: `IPC.projectsDelete`; `window.api.projects.delete(projectId: string): Promise<void>`.

- [ ] **Step 1: Add the IPC channel**

In `src/shared/types/ipc-contract.ts`, add after `projectsUpdateDetails: 'projects:updateDetails',`:

```ts
  projectsDelete: 'projects:delete',
```

- [ ] **Step 2: Add the IPC handler**

In `src/main/ipc/projects.ipc.ts`, update the `../db/repositories/projectsRepo` import to add `deleteProject` and `getProjectById`:

```ts
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectCurrencySettings,
  updateProjectDetails
} from '../db/repositories/projectsRepo'
```

Add a new import for the storage helper and `AppError` (not currently imported in this file):

```ts
import { deleteProjectFiles } from '../storage/projectStorage'
import { AppError } from '../errors/AppError'
```

Add the handler at the end of `registerProjectsIpc()`, before the closing `}`:

```ts
  safeHandle(IPC.projectsDelete, (_event, projectId: string): void => {
    const project = getProjectById(projectId)
    if (!project) throw new AppError('DB_PROJECT_NOT_FOUND')
    deleteProjectFiles(projectId)
    deleteProject(projectId)
  })
```

- [ ] **Step 3: Add the preload bridge**

In `src/preload/index.ts`, inside the `projects: { ... }` object, add after `updateDetails`:

```ts
    delete: (projectId: string): Promise<void> => ipcRenderer.invoke(IPC.projectsDelete, projectId)
```

No new type import needed — this method only uses `string`/`Promise<void>`.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npm run test:all`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/projects.ipc.ts src/preload/index.ts
git commit -m "feat: expose project deletion over IPC"
```

---

### Task 3: Frontend — hook, store action, switcher UI, App.tsx wiring

**Files:**
- Modify: `src/renderer/src/state/useUiStore.ts`
- Modify: `src/renderer/src/state/queries/useProjects.ts`
- Modify: `src/renderer/src/components/layout/ProjectSwitcherModal.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `window.api.projects.delete` (Task 2).
- Produces: `useUiStore().clearProject()`; `useDeleteProject()` hook; `ProjectSwitcherModal`'s new `onDeleteProject` prop; `App.tsx`'s `handleDeleteProject`.

- [ ] **Step 1: Add `clearProject` to `useUiStore`**

In `src/renderer/src/state/useUiStore.ts`, add to the `UiState` interface, after `clearSld: () => void`:

```ts
  clearProject: () => void
```

Add to the store implementation, after `clearSld: (): void => set({ selectedSldId: null, selectedQuotationId: null }),`:

```ts
  clearProject: (): void =>
    set({ selectedProjectId: null, selectedSldId: null, selectedQuotationId: null }),
```

- [ ] **Step 2: Add `useDeleteProject` to `useProjects.ts`**

Add at the end of `src/renderer/src/state/queries/useProjects.ts`:

```ts
export function useDeleteProject(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => window.api.projects.delete(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  })
}
```

- [ ] **Step 3: Update `ProjectSwitcherModal.tsx`**

The row wrapper changes from `<button>` to `<div>` (a delete `<button>` can't nest inside another `<button>` — same reasoning `QuotationTable`'s clickable-but-not-button `<tr>` rows already follow). Replace the full contents of `src/renderer/src/components/layout/ProjectSwitcherModal.tsx`:

```tsx
import { Check, Trash2 } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Badge } from '@renderer/components/common/Badge'
import { cn } from '@renderer/lib/cn'
import type { Project } from '@shared/types/entities'

interface ProjectSwitcherModalProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (projectId: string) => void
  onDeleteProject: (project: Project) => void
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function ProjectSwitcherModal({
  open,
  onClose,
  projects,
  selectedProjectId,
  onSelectProject,
  onDeleteProject
}: ProjectSwitcherModalProps): React.JSX.Element {
  const handleSelect = (projectId: string): void => {
    if (projectId !== selectedProjectId) onSelectProject(projectId)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Switch project" className="w-[480px] max-w-[90vw]">
      <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
        {projects.length === 0 && (
          <p className="py-4 text-center text-xs text-text-muted">No projects yet.</p>
        )}
        {projects.map((project) => {
          const isActive = project.id === selectedProjectId
          return (
            <div
              key={project.id}
              onClick={() => handleSelect(project.id)}
              className={cn(
                'group flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface hover:bg-surface-hover'
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{project.name}</div>
                {project.substationLabel && (
                  <div className="truncate text-xs text-text-muted">{project.substationLabel}</div>
                )}
                <div className="mt-0.5 text-[11px] text-text-muted">
                  Created {formatCreatedAt(project.createdAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isActive && (
                  <Badge tone="info">
                    <Check className="h-3 w-3" />
                    Active
                  </Badge>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteProject(project)
                  }}
                  title="Delete project"
                  className="rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger-bg hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Wire it into `App.tsx`**

Update the `@renderer/state/queries/useProjects` import to add `useDeleteProject`:

```ts
import { useDeleteProject, useProjects } from '@renderer/state/queries/useProjects'
```

Update the `useUiStore()` destructure to add `clearProject`:

```ts
  const {
    selectedProjectId,
    selectedSldId,
    selectedQuotationId,
    panelMode,
    selectProject,
    selectSld,
    selectQuotation,
    clearSld,
    clearQuotation,
    clearProject,
    setPanelMode
  } = useUiStore()
```

Add the hook near the other delete hooks:

```ts
  const deleteProject = useDeleteProject()
```

Add the handler near `handleDeleteSld`/`handleDeleteQuotation`:

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

`App.tsx`'s existing type-only import (`import type { Quotation, Sld } from '@shared/types/entities'`) doesn't include `Project` yet — update it to:

```ts
import type { Project, Quotation, Sld } from '@shared/types/entities'
```

Add the new prop to the existing `<ProjectSwitcherModal>` render:

```tsx
        <ProjectSwitcherModal
          open={projectSwitcherOpen}
          onClose={() => setProjectSwitcherOpen(false)}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={selectProject}
          onDeleteProject={handleDeleteProject}
        />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/state/useUiStore.ts src/renderer/src/state/queries/useProjects.ts src/renderer/src/components/layout/ProjectSwitcherModal.tsx src/renderer/src/App.tsx
git commit -m "feat: add delete-project UI to the project switcher"
```

---

### Task 4: Full regression and live verification

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

Ask the user to, in the running app:

1. Create a throwaway test project, add an SLD to it, generate a quotation, then delete the project from the project switcher. Confirm it disappears from the list.
2. Confirm the project's files are gone from `userData/projects/<id>/` (or just trust the DB cascade + `rmSync` call — this is the one piece of the feature that isn't dbtest-covered).
3. With a different project open, delete a *different* (non-active) project from the switcher and confirm the currently-open project's view is undisturbed.
4. Delete the *currently open* project and confirm the app switches to another project's view correctly (not a blank/broken state).
5. If only one project remains, delete it and confirm the app doesn't crash or show a broken empty state.

- [ ] **Step 4: Update project memory**

Once the user confirms results, update the `project-post-beta-feedback-backlog` memory to mark this item done — this closes out the last scoped item from that backlog (multi-AI-provider support remains, still unscoped).
