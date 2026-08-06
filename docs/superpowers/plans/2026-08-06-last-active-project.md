# Remember Last-Active Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app reopens to whichever project the user was last actually working in, instead of always defaulting to the most-recently-created one.

**Architecture:** One new nullable field, `lastActiveProjectId`, added to the existing `AppSettings`/`settings.json` mechanism (same pattern as `dismissedUpdateVersion` — no new IPC channel, reuses `settings:update`). `App.tsx`'s project-selection logic reads it on launch and writes it on every explicit project selection.

**Tech Stack:** Existing `settingsStore.ts` JSON-file persistence, existing `useSettings`/`useUpdateSettings` React Query hooks. No new dependencies.

## Global Constraints

- No new IPC channel — reuses the existing generic `settings:update`. Source: spec Component 1.
- The launch-time auto-select effect must fall back to today's behavior (`projects[0]`, the newest-created project) whenever there's no remembered id or it points at a since-deleted project — no separate error handling needed, just a lookup that can miss. Source: spec Component 3.
- This codebase does not unit-test `settingsStore.ts`, IPC handlers, or `App.tsx`'s selection logic (confirmed: no existing test files for any of them) — matches the established convention for this class of glue code. Coverage here is typecheck + the full existing test suite staying green + live verification, not new test files.

---

### Task 1: `AppSettings.lastActiveProjectId`

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/settings/settingsStore.ts`

**Interfaces:**
- Produces: `AppSettings.lastActiveProjectId: string | null` — consumed by Task 2's `App.tsx` changes via the existing `useSettings()`/`useUpdateSettings()` hooks (unchanged signatures).

- [ ] **Step 1: Add the field to the type**

In `src/shared/types/entities.ts`, in the `AppSettings` interface, add after `dismissedUpdateVersion: string | null`:

```typescript
  /** Project the user last had selected — restored on next launch if it still exists. */
  lastActiveProjectId: string | null
```

- [ ] **Step 2: Add the default**

In `src/main/settings/settingsStore.ts`'s `defaultSettings()`, add after `dismissedUpdateVersion: null,`:

```typescript
    lastActiveProjectId: null,
```

- [ ] **Step 3: Add the merge**

In `getSettings()`'s return object, add after `dismissedUpdateVersion: parsed.dismissedUpdateVersion ?? defaults.dismissedUpdateVersion,`:

```typescript
      lastActiveProjectId: parsed.lastActiveProjectId ?? defaults.lastActiveProjectId,
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/entities.ts src/main/settings/settingsStore.ts
git commit -m "feat: add lastActiveProjectId to AppSettings"
```

---

### Task 2: `App.tsx` reads and writes the remembered project

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `AppSettings.lastActiveProjectId` from Task 1, via the already-imported `useSettings()` and a newly-imported `useUpdateSettings()` (both from `@renderer/state/queries/useSettings`, unchanged signatures).

- [ ] **Step 1: Import `useUpdateSettings`**

In `src/renderer/src/App.tsx`, change:

```typescript
import { useSettings } from '@renderer/state/queries/useSettings'
```

to:

```typescript
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
```

- [ ] **Step 2: Instantiate the mutation**

Near the other mutations (after `const exportProject = useExportProject()`), add:

```typescript
  const updateSettings = useUpdateSettings()
```

- [ ] **Step 3: Add the persisting selection wrapper**

After the `handleDeleteProject` function (so it's defined before use, matching the file's existing top-to-bottom handler ordering), add:

```typescript
  const handleSelectProject = (projectId: string): void => {
    selectProject(projectId)
    updateSettings.mutate({ lastActiveProjectId: projectId })
  }
```

- [ ] **Step 4: Persist on delete of the active project**

Change:

```typescript
    await deleteProject.mutateAsync(project.id)
    if (selectedProjectId === project.id) clearProject()
```

to:

```typescript
    await deleteProject.mutateAsync(project.id)
    if (selectedProjectId === project.id) {
      clearProject()
      updateSettings.mutate({ lastActiveProjectId: null })
    }
```

- [ ] **Step 5: Prefer the remembered project on launch**

Change the existing auto-select effect:

```typescript
  // Auto-select the most recently created project once the list loads.
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      selectProject(projects[0].id)
    }
  }, [projects, selectedProjectId, selectProject])
```

to:

```typescript
  // Auto-select the last-active project once both the project list and
  // settings have loaded. Falls back to the most-recently-created project
  // (today's prior behavior) if there's no remembered selection, or it
  // points at a since-deleted project — the .find() below just won't match,
  // no separate error handling needed.
  useEffect(() => {
    if (selectedProjectId || projects.length === 0 || !settings) return
    const remembered = projects.find((p) => p.id === settings.lastActiveProjectId)
    selectProject((remembered ?? projects[0]).id)
  }, [projects, selectedProjectId, selectProject, settings])
```

Note this deliberately calls the raw `selectProject` (not `handleSelectProject`) — an automatic launch-time fallback pick is not a user selection and should not overwrite what they'll be remembered as having chosen next time; only explicit selection (Step 6) persists.

- [ ] **Step 6: Use the persisting wrapper at both explicit-selection call sites**

Change:

```typescript
        <CreateProjectDialog
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={(projectId) => {
            selectProject(projectId)
            setCreateProjectOpen(false)
          }}
```

to:

```typescript
        <CreateProjectDialog
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={(projectId) => {
            handleSelectProject(projectId)
            setCreateProjectOpen(false)
          }}
```

Change:

```typescript
          onSelectProject={selectProject}
```

to:

```typescript
          onSelectProject={handleSelectProject}
```

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck:web && npm run lint`
Expected: no errors. (`npx eslint src/renderer/src/App.tsx` if you want to isolate this file from the rest of the repo's pre-existing unrelated lint warnings.)

- [ ] **Step 8: Live-verify in the running app**

Run: `npm run dev`. With at least two existing projects:
1. Switch to an older (non-newest) project via the Project Switcher.
2. Quit the app (fully close it, not just the window if it lingers in the tray) and relaunch with `npm run dev` again.
3. Confirm it reopens directly to the project you switched to in step 1, not the newest one.
4. Create a brand-new project; confirm it becomes selected immediately and stays selected across another restart.
5. Delete the currently-active project; confirm the app falls back to another project (today's existing fallback behavior) and that a subsequent restart doesn't try to reselect the deleted one.

- [ ] **Step 9: Run the full test suite**

Run: `npm run test:all`
Expected: all existing tests still pass (no new tests added this plan — see Global Constraints).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: remember and restore the last-active project across restarts"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 (AppSettings field) → Task 1. Component 2 (persist on selection) → Task 2 Steps 3, 6. Component 3 (launch-time preference) → Task 2 Step 5. Component 4 (clear on delete) → Task 2 Step 4.
- **No dedicated tests added**, matching the codebase's existing convention for this class of code (confirmed no test files exist today for `settingsStore.ts`, `App.tsx`'s selection logic, or comparable IPC/settings glue elsewhere) — coverage is typecheck + full suite + live verification (Task 2 Steps 7-9).
- **Type consistency check:** `lastActiveProjectId: string | null` is identical across the type (Task 1 Step 1), the default (Task 1 Step 2), the merge (Task 1 Step 3), and every read/write site in `App.tsx` (Task 2) — no risk of a stray `string | undefined` mismatch since it mirrors `dismissedUpdateVersion`'s already-proven shape exactly.
