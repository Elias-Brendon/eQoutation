# Project Switcher — Design Spec

**Date:** 2026-07-31
**Status:** Approved
**Roadmap context:** Item 3 of the agreed remaining-stages roadmap (see memory `project_remaining_stages_roadmap`), originally Stage 14 "multi-project switcher" in the base plan.

## Problem

The app has no way to switch between existing projects. `useProjects()` fetches the full project list, but `App.tsx` only auto-selects `projects[0]` (most recently created) on load. The TopBar shows the active project's name as static, non-interactive text. Once a second project exists, there is no UI path to it at all.

## Scope

Switching only. No rename/delete/archive (those stay out of scope — no such backend capability exists today either, and adding it is a separate item if ever needed). No search/filter — expected project count is small (< 20), a plain scrollable list is enough. No new IPC or backend changes; this is a renderer-only feature built on the existing `useProjects()` query.

## Architecture

- **`src/renderer/src/components/layout/ProjectSwitcherModal.tsx`** (new) — follows the existing `Modal` component pattern used by `CatalogModal` / `CreateProjectDialog`.
- **`TopBar.tsx`** — the current static project name/label block (lines 56–63) becomes a clickable button that opens the switcher. Add an `onOpenProjectSwitcher: () => void` prop.
- **`App.tsx`** — add a `projectSwitcherOpen` boolean state alongside the existing `createProjectOpen`/`catalogOpen`/`settingsOpen` flags. Render `<ProjectSwitcherModal>` alongside the other modals. Pass `projects`, `selectedProjectId`, and the existing `selectProject` action (from `useUiStore`, already used elsewhere in `App.tsx`) as props.

No backend/IPC/DB changes. `useProjects()` (`state/queries/useProjects.ts`) already returns the full `Project[]` list, kept fresh by the existing React Query invalidation on project creation.

## Modal content & behavior

- Lists all projects sorted `createdAt DESC` — this is the existing repo query order (`projectsRepo.ts:35`, `ORDER BY created_at DESC`), so no new sorting logic is needed; it also matches today's "most recent project auto-selected" behavior.
- Each row shows: `name`, `substationLabel`, and a formatted `createdAt` date.
  - **Not** "last updated": `Project.updatedAt` currently only bumps on currency-settings edits (`projectsRepo.ts:91`, `updateCurrencySettings`), not on SLD/quotation activity. Displaying it as "last updated" would misrepresent it as recent-activity tracking, which it isn't. Building real last-activity tracking (bumping `updated_at` on every SLD/quotation write) is out of scope for a switcher — it would touch every write path in `sldsRepo`/`quotationsRepo` for no requested benefit.
- The currently-active project (`selectedProjectId`) is visually distinguished (highlighted row + "Active" badge/label).
- Clicking a row calls `selectProject(project.id)` (existing `useUiStore` action — already clears `selectedSldId`/`selectedQuotationId` on project change, so no extra state-reset logic is needed) and closes the modal.
- Clicking the already-active row just closes the modal (no redundant reselect needed, but harmless if it happens).
- No search box, no create/rename/delete actions inside the modal. The existing "New Project" TopBar button remains the only creation path.

## Error handling

None needed beyond what `useProjects()` already provides (React Query's existing loading/error states — the modal simply doesn't render project rows until data loads; TopBar already only renders the project name when `project` is non-null, so the trigger button naturally has nothing to click before the first project exists).

## Testing

- Component test: renders all projects, active one marked, clicking a row calls `selectProject` with the right id and triggers `onClose`.
- Manual/live verification: create a second test project, confirm the TopBar name is clickable, switcher lists both, switching updates TopBar/SLD list/quotation list to the other project's data, and the previously-selected SLD/quotation panel clears correctly.
