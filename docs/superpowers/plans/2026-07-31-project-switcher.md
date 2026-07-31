# Project Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user switch between existing projects via a modal opened by clicking the project name in the TopBar.

**Architecture:** Renderer-only change. A new `ProjectSwitcherModal` lists all projects (already fetched by the existing `useProjects()` query), highlights the active one, and calls the existing `useUiStore().selectProject(id)` action on click. `TopBar` gets a click handler on the project name block; `App.tsx` wires the new modal's open/close state alongside its existing sibling modals (`createProjectOpen`, `catalogOpen`, `settingsOpen`).

**Tech Stack:** React 19 + TypeScript, Tailwind v4, Zustand (`useUiStore`), TanStack Query (`useProjects`), `lucide-react` icons, `framer-motion` (via the shared `Modal` component).

## Global Constraints

- No backend/IPC/DB changes — this plan only touches `src/renderer/src/`.
- Full spec: `docs/superpowers/specs/2026-07-31-project-switcher-design.md`.
- **No renderer component test infra exists in this codebase** — the 2026-07-28 test-infrastructure work explicitly scoped out renderer/React component tests (`docs/superpowers/specs/2026-07-28-test-infrastructure-design.md`), and there is not a single `*.test.tsx` file in `src/renderer/`. Do not introduce `@testing-library/react` or any new test tooling as part of this plan — that would be a separate, unscoped undertaking. Verification for each task is `npm run typecheck:web`, `npm run lint`, and (final task) manual click-through in the running app, matching how every other renderer component in this codebase is verified (see memory `feedback_verify_live`).
- Show the project's `createdAt` (formatted), never `updatedAt`, as the row's date — `Project.updatedAt` only bumps on currency-settings edits (`src/main/db/repositories/projectsRepo.ts:91`), not on real project activity, so labeling it "last updated" would be misleading. See spec section "Modal content & behavior".
- Sort order is `createdAt DESC` — this is already the repository's query order (`projectsRepo.ts:35`, `ORDER BY created_at DESC`), so `useProjects()` data requires no client-side re-sorting.
- Follow the existing `Modal` / `Badge` / `Button` component APIs exactly as they exist today (read below) — do not modify those shared components.

**Existing component APIs this plan depends on (do not change their signatures):**

```ts
// src/renderer/src/components/common/Modal.tsx
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}
export function Modal(props: ModalProps): React.JSX.Element | null

// src/renderer/src/components/common/Badge.tsx
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  // ...plus all normal <span> props (children, className, etc.)
}
export function Badge(props: BadgeProps): React.JSX.Element

// src/renderer/src/state/useUiStore.ts (Zustand store, already exists, unchanged)
interface UiState {
  selectedProjectId: string | null
  selectProject: (projectId: string) => void // already clears selectedSldId/selectedQuotationId
  // ...other fields or actions from this store are NOT needed by this plan
}

// src/renderer/src/state/queries/useProjects.ts (already exists, unchanged)
export function useProjects(): UseQueryResult<Project[]>

// src/shared/types/entities.ts (already exists, unchanged)
export interface Project {
  id: string
  name: string
  substationLabel: string
  createdAt: string // ISO 8601
  // ...other fields not needed by this plan
}
```

---

### Task 1: `ProjectSwitcherModal` component

**Files:**
- Create: `src/renderer/src/components/layout/ProjectSwitcherModal.tsx`

**Interfaces:**
- Consumes: `Modal` (`components/common/Modal.tsx`), `Badge` (`components/common/Badge.tsx`), `Project` type (`@shared/types/entities`).
- Produces: `ProjectSwitcherModalProps` and `ProjectSwitcherModal` component, consumed by Task 3 (`App.tsx`):

```ts
interface ProjectSwitcherModalProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (projectId: string) => void
}
export function ProjectSwitcherModal(props: ProjectSwitcherModalProps): React.JSX.Element
```

There is no existing renderer test infra (see Global Constraints), so this task is verified by typecheck/lint plus the manual click-through in Task 4 — there is no isolated unit test step here.

- [ ] **Step 1: Write the component**

```tsx
import { Check } from 'lucide-react'
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
  onSelectProject
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
            <button
              key={project.id}
              type="button"
              onClick={() => handleSelect(project.id)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface hover:bg-surface-hover'
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">
                  {project.name}
                </div>
                {project.substationLabel && (
                  <div className="truncate text-xs text-text-muted">
                    {project.substationLabel}
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-text-muted">
                  Created {formatCreatedAt(project.createdAt)}
                </div>
              </div>
              {isActive && (
                <Badge tone="info" className="shrink-0">
                  <Check className="h-3 w-3" />
                  Active
                </Badge>
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck:web`
Expected: no errors.

Run: `npm run lint`
Expected: no errors (fix any formatting/lint issues it reports before continuing).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/layout/ProjectSwitcherModal.tsx
git commit -m "feat: add ProjectSwitcherModal component"
```

---

### Task 2: Make the TopBar project name clickable

**Files:**
- Modify: `src/renderer/src/components/layout/TopBar.tsx:13-63`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new required prop on `TopBar`, consumed by Task 3 (`App.tsx`):

```ts
interface TopBarProps {
  // ...all existing props, unchanged, plus:
  onOpenProjectSwitcher: () => void
}
```

- [ ] **Step 1: Add the prop to `TopBarProps` and the function signature**

In `src/renderer/src/components/layout/TopBar.tsx`, add to the `TopBarProps` interface (after `project: Project | null`):

```ts
  onOpenProjectSwitcher: () => void
```

Add `onOpenProjectSwitcher` to the destructured props in the `TopBar` function signature (alongside `project`, `matcherFlagCount`, etc.).

- [ ] **Step 2: Wrap the project name block in a button**

Replace this block (current lines 56–63):

```tsx
      {project ? (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary">{project.name}</div>
          <div className="truncate text-xs text-text-muted">{project.substationLabel}</div>
        </div>
      ) : (
        <div className="text-sm text-text-muted">No project yet</div>
      )}
```

with:

```tsx
      {project ? (
        <button
          type="button"
          onClick={onOpenProjectSwitcher}
          title="Switch project"
          className="min-w-0 rounded px-1 -mx-1 text-left transition-colors hover:bg-surface-hover"
        >
          <div className="truncate text-sm font-semibold text-text-primary">{project.name}</div>
          <div className="truncate text-xs text-text-muted">{project.substationLabel}</div>
        </button>
      ) : (
        <div className="text-sm text-text-muted">No project yet</div>
      )}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck:web`
Expected: fails at this point because `App.tsx` does not yet pass `onOpenProjectSwitcher` to `<TopBar>` — confirm the error is specifically a missing-prop error on the `<TopBar ...>` usage in `App.tsx`, not something else. This is expected; Task 3 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/TopBar.tsx
git commit -m "feat: make TopBar project name open the project switcher"
```

---

### Task 3: Wire the modal into `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `ProjectSwitcherModal` (Task 1), `TopBar`'s new `onOpenProjectSwitcher` prop (Task 2), existing `useProjects()`, existing `useUiStore().selectProject`.
- Produces: nothing consumed by later tasks (this is the last code task).

- [ ] **Step 1: Import the new component**

Add near the other layout imports (after the `CreateProjectDialog` import, `App.tsx:12`):

```ts
import { ProjectSwitcherModal } from '@renderer/components/layout/ProjectSwitcherModal'
```

- [ ] **Step 2: Add the open/close state**

Next to the existing sibling modal state (`App.tsx:62-65`, `createProjectOpen` / `addSldOpen` / `catalogOpen` / `settingsOpen`), add:

```ts
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)
```

- [ ] **Step 3: Pass the trigger prop to `TopBar`**

In the `<TopBar ...>` usage (`App.tsx:181-197`), add the new prop (e.g. right after `onOpenCatalog`):

```tsx
          onOpenProjectSwitcher={() => setProjectSwitcherOpen(true)}
```

- [ ] **Step 4: Render the modal**

Next to the other modals near the end of the JSX (after the `<CreateProjectDialog ... />` block, `App.tsx:240-247`), add:

```tsx
        <ProjectSwitcherModal
          open={projectSwitcherOpen}
          onClose={() => setProjectSwitcherOpen(false)}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={selectProject}
        />
```

(`projects` and `selectedProjectId` are already destructured/fetched earlier in `App.tsx` — `projects` from `useProjects()` at line 50, `selectedProjectId` and `selectProject` from `useUiStore()` at lines 38/42. No new data fetching needed.)

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck:web`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: wire the project switcher modal into App"
```

---

### Task 4: Live verification

**Files:** none (manual verification only — no code changes).

- [ ] **Step 1: Start the app**

Run: `npm run dev` (if not already running; if the dev server is already up, renderer changes hot-reload — no restart needed since nothing in this plan touches `src/main/`).

- [ ] **Step 2: Confirm the trigger**

In the running app, with a project loaded, hover then click the project name/label in the TopBar. Confirm: cursor shows a pointer/hover background on the name block, and clicking opens a modal titled "Switch project".

- [ ] **Step 3: Confirm single-project display**

With only one project existing (or whatever the current dev DB state is), confirm the modal lists it with an "Active" badge, correct name/substation label, and a "Created <date>" line using the real creation date (not blank, not "Invalid Date").

- [ ] **Step 4: Create a second project and confirm switching**

Use the existing "New Project" TopBar button to create a throwaway second project (do not touch the user's real `substartion-One` project — see memory `project_build_status`, "Test data (do not touch)"). Open the switcher again; confirm both projects are listed, the newly created one is marked "Active" (since project creation auto-selects it), sorted newest-first.

Click the other (now-inactive) project's row. Confirm: the modal closes, the TopBar name/label updates to that project, the SLD list and Quotation list columns update to that project's data (or show empty state if it has none), and no stale SLD/quotation panel content from the previous project remains visible.

- [ ] **Step 5: Confirm closing without switching**

Reopen the switcher, click the backdrop (or press Escape if the `Modal` component supports it — check `Modal.tsx`'s current behavior) to dismiss without selecting a row. Confirm the active project is unchanged.

- [ ] **Step 6: Report results and clean up test data**

If everything above passes, report to the user. If the throwaway second project created in Step 4 is not otherwise useful to keep, ask the user before deleting anything (there is currently no delete-project UI/IPC — see spec's scope note — so removal would require direct DB access, which needs explicit confirmation first).

- [ ] **Step 7: Update roadmap memory**

Update the `project_remaining_stages_roadmap` memory file: mark item 3 (multi-project switcher) complete, note the commit range, and set "next up" to item 4 (per-project AI model override).
