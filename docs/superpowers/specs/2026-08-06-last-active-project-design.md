# Remember Last-Active Project Across Restarts — Design

**Date:** 2026-08-06
**Status:** Approved
**Context:** Every project already auto-persists to SQLite the instant it's created or edited — there's no manual "save" step and nothing is ever lost. Users can already reload any saved project via the Project Switcher (`ProjectSwitcherModal.tsx`, opened from the project name in `TopBar`). The actual gap: `useUiStore`'s `selectedProjectId` (`src/renderer/src/state/useUiStore.ts`) is in-memory only. `App.tsx`'s launch-time effect always auto-selects `projects[0]` (the most-recently-*created* project, per `useProjects`'s `createdAt DESC` ordering) — not whichever project the user was last actually working in. Restarting the app after opening an older project silently jumps back to the newest one.

## Scope decision

Add one nullable field, `lastActiveProjectId`, to the existing `AppSettings`/`settings.json` mechanism — the same pattern already used for `dismissedUpdateVersion` (a small persisted UI preference, not a new subsystem). This was chosen over persisting `selectedProjectId` via zustand's `persist` middleware into the renderer's own `localStorage`: that would work, but it'd be the only piece of durable app state living outside `settings.json`, invisible to Settings > Diagnostics' export, and inconsistent with how every other persisted preference in this app is stored and inspected. Not worth the inconsistency for something this small.

## Components

### 1. `AppSettings` gets `lastActiveProjectId: string | null`

Added to `src/shared/types/entities.ts`'s `AppSettings` interface, `src/main/settings/settingsStore.ts`'s `defaultSettings()` (default `null`) and `getSettings()`'s merge block (`parsed.lastActiveProjectId ?? defaults.lastActiveProjectId`) — mirrors `dismissedUpdateVersion` exactly, field for field. No new IPC channel: this reuses the existing generic `settings:update`/`useUpdateSettings()` plumbing, same as `dismissedUpdateVersion` does today.

### 2. `App.tsx` persists on every project selection

A new `handleSelectProject(projectId: string)` wrapper replaces the two places `selectProject` (the `useUiStore` setter) is currently called directly — `CreateProjectDialog`'s `onCreated` callback and `ProjectSwitcherModal`'s `onSelectProject` prop. The wrapper calls both `selectProject(projectId)` (unchanged, immediate in-memory UI update) and `updateSettings.mutate({ lastActiveProjectId: projectId })` (fire-and-forget persistence — no loading state needed, this is a low-stakes preference write, not a user-facing action with success/failure feedback).

### 3. Launch-time selection prefers the remembered project

The existing auto-select effect (`App.tsx`, currently: `if (!selectedProjectId && projects.length > 0) selectProject(projects[0].id)`) changes to: once both `projects` and `settings` have loaded, if `settings.lastActiveProjectId` matches an id in `projects`, select that one; otherwise fall back to `projects[0]` exactly as today. This makes "point at a since-deleted project" and "never selected anything yet" collapse into the same harmless fallback path — no separate error handling needed for a stale id.

### 4. Deleting the active project clears the setting too

`handleDeleteProject`'s existing `if (selectedProjectId === project.id) clearProject()` gains a sibling `updateSettings.mutate({ lastActiveProjectId: null })` in the same branch. Not strictly required for correctness (Component 3's fallback already handles a stale id gracefully), but keeps `settings.json` from carrying a dangling reference to a project that no longer exists, which would be confusing to find during future debugging (e.g. via the Diagnostics export).

## Out of scope

- No change to how projects are created, edited, or deleted — this only affects which project is *selected* on launch.
- No per-SLD or per-quotation "last viewed" memory — only the project level, matching the scope of what was actually reported missing.
- No UI indicator of "this is your last-active project" — the existing Project Switcher's highlight-the-selected-project treatment already covers that once it's loaded.
