# Per-Project AI Model Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project optionally override the global AI-model setting so its extractions use a different Claude model than the rest of the app.

**Architecture:** Mirrors the existing per-project `currency` field end-to-end (migration → repo → IPC → preload → renderer hook → UI). A new nullable `projects.ai_model_override` column holds the override (`null` = use the global default). The extraction IPC handler computes `project.aiModelOverride ?? settings.aiModel` once per extraction request and passes that as the effective model. The UI control lives in `ExtractionPanel`, labeled as project-wide.

**Tech Stack:** Electron main process (better-sqlite3, hand-rolled migrations), React 19 + TypeScript renderer, TanStack Query, Vitest (`*.dbtest.ts` run under `npm run test:db`).

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-31-per-project-ai-model-override-design.md`.
- No per-SLD granularity — project-level only.
- `null` override means "use the global default" — never store an empty string or the literal default model id as a stand-in for "no override."
- No new model catalog — reuse `AVAILABLE_AI_MODELS` from `src/shared/constants/aiModels.ts` exactly as Settings already does.
- No renderer component test infra exists in this codebase (confirmed during the 2026-07-28 test-infrastructure work and again during the 2026-07-31 project-switcher work) — UI verification is manual/live, not automated. Backend logic (repo function) does get an automated `*.dbtest.ts` test.
- Follow existing patterns exactly — this plan is a structural mirror of the currency-override feature already in the codebase; do not deviate from its shape without reason.

**Existing code this plan depends on (do not change these signatures except where a task explicitly says so):**

```ts
// src/shared/types/entities.ts (existing, before this plan's changes)
export interface Project {
  id: string
  name: string
  substationLabel: string
  currency: string
  exchangeRate: number
  exchangeRateIsManual: boolean
  exchangeRateUpdatedAt: string | null
  aiProgressPct: number
  createdAt: string
  updatedAt: string
}

// src/shared/types/entities.ts — the global default this feature falls back to
export interface Settings {
  // ...other fields
  aiModel: string
}

// src/shared/constants/aiModels.ts (existing, unchanged)
export const AVAILABLE_AI_MODELS: readonly { id: string; label: string }[]
export const DEFAULT_AI_MODEL: string

// src/main/db/repositories/projectsRepo.ts (existing, unchanged)
export function getProjectById(id: string): Project | null

// src/main/settings/settingsStore.ts (existing, unchanged)
export function getSettings(): Settings
```

---

### Task 1: DB migration, shared type, and repo function

**Files:**
- Create: `src/main/db/migrations/0023_project_ai_model_override.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/db/repositories/projectsRepo.ts`
- Test: `src/main/db/repositories/projectsRepo.dbtest.ts` (new file — no existing tests for this repo)

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 2):

```ts
// src/shared/types/entities.ts additions
export interface Project {
  // ...all existing fields, plus:
  aiModelOverride: string | null
}

export interface UpdateProjectAiModelOverrideInput {
  projectId: string
  aiModelOverride: string | null
}

// src/main/db/repositories/projectsRepo.ts addition
export function updateProjectAiModelOverride(id: string, aiModelOverride: string | null): Project
```

- [ ] **Step 1: Write the failing test**

Create `src/main/db/repositories/projectsRepo.dbtest.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../index'
import {
  createProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride
} from './projectsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('projectsRepo aiModelOverride', () => {
  it('defaults a new project to no override', () => {
    const project = createProject({ name: 'Test Project' })
    expect(project.aiModelOverride).toBeNull()
  })

  it('sets an override and reflects it via getProjectById and listProjects', () => {
    const project = createProject({ name: 'Test Project' })

    const updated = updateProjectAiModelOverride(project.id, 'claude-opus-4-8')
    expect(updated.aiModelOverride).toBe('claude-opus-4-8')

    const fetched = getProjectById(project.id)
    expect(fetched?.aiModelOverride).toBe('claude-opus-4-8')

    const listed = listProjects().find((p) => p.id === project.id)
    expect(listed?.aiModelOverride).toBe('claude-opus-4-8')
  })

  it('clears an override back to null', () => {
    const project = createProject({ name: 'Test Project' })
    updateProjectAiModelOverride(project.id, 'claude-opus-4-8')

    const cleared = updateProjectAiModelOverride(project.id, null)
    expect(cleared.aiModelOverride).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `updateProjectAiModelOverride` is not exported from `projectsRepo.ts` (and `aiModelOverride` doesn't exist on `Project` yet, so this won't even typecheck cleanly — that's expected at this point).

- [ ] **Step 3: Create the migration**

Create `src/main/db/migrations/0023_project_ai_model_override.ts`:

```ts
export const sql = `
ALTER TABLE projects ADD COLUMN ai_model_override TEXT NULL;
`
```

- [ ] **Step 4: Register the migration**

In `src/main/db/migrations/index.ts`, add the import after the `m0022` import:

```ts
import { sql as m0023 } from './0023_project_ai_model_override'
```

Add the entry after the version-22 entry in the `migrations` array:

```ts
  { version: 23, name: '0023_project_ai_model_override', sql: m0023 }
```

- [ ] **Step 5: Add the field to the shared `Project` type**

In `src/shared/types/entities.ts`, add `aiModelOverride: string | null` to the `Project` interface (after `updatedAt`), and add a new interface right after `UpdateProjectCurrencySettingsInput`:

```ts
export interface UpdateProjectAiModelOverrideInput {
  projectId: string
  aiModelOverride: string | null
}
```

- [ ] **Step 6: Update the repo**

In `src/main/db/repositories/projectsRepo.ts`:

Add `ai_model_override: string | null` to the `ProjectRow` interface (after `updated_at`).

In `toProject`, add `aiModelOverride: row.ai_model_override` (after `updatedAt: row.updated_at`).

In `createProject`, add `ai_model_override: null` to the `row` object (after `updated_at: now`), and add `, ai_model_override` to both the column list and the `VALUES` placeholder list of the `INSERT` statement:

```ts
  getDb()
    .prepare(
      `INSERT INTO projects
         (id, name, substation_label, currency, exchange_rate, exchange_rate_is_manual,
          exchange_rate_updated_at, ai_progress_pct, created_at, updated_at, ai_model_override)
       VALUES
         (@id, @name, @substation_label, @currency, @exchange_rate, @exchange_rate_is_manual,
          @exchange_rate_updated_at, @ai_progress_pct, @created_at, @updated_at, @ai_model_override)`
    )
    .run(row)
```

Add the new function at the end of the file:

```ts
export function updateProjectAiModelOverride(id: string, aiModelOverride: string | null): Project {
  getDb()
    .prepare('UPDATE projects SET ai_model_override = @ai_model_override WHERE id = @id')
    .run({ id, ai_model_override: aiModelOverride })
  return getProjectById(id) as Project
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS (all 3 new tests, plus the existing suite still green).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors. (This touches `src/main/` and `src/shared/` — the node project, not web.)

- [ ] **Step 9: Commit**

```bash
git add src/main/db/migrations/0023_project_ai_model_override.ts src/main/db/migrations/index.ts src/shared/types/entities.ts src/main/db/repositories/projectsRepo.ts src/main/db/repositories/projectsRepo.dbtest.ts
git commit -m "feat: add ai_model_override column and repo function to projects"
```

---

### Task 2: IPC endpoint and preload

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/projects.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `updateProjectAiModelOverride` (Task 1), `UpdateProjectAiModelOverrideInput` (Task 1).
- Produces (consumed by Task 3):

```ts
// window.api.projects.updateAiModelOverride, callable from the renderer
updateAiModelOverride(input: UpdateProjectAiModelOverrideInput): Promise<Project>
```

- [ ] **Step 1: Add the IPC channel name**

In `src/shared/types/ipc-contract.ts`, add a line right after `projectsUpdateCurrencySettings: 'projects:updateCurrencySettings',`:

```ts
  projectsUpdateAiModelOverride: 'projects:updateAiModelOverride',
```

- [ ] **Step 2: Register the main-process handler**

In `src/main/ipc/projects.ipc.ts`, update the import line to include the new repo function:

```ts
import {
  createProject,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectCurrencySettings
} from '../db/repositories/projectsRepo'
```

Update the type import to include the new input type:

```ts
import type {
  CreateProjectInput,
  Project,
  UpdateProjectAiModelOverrideInput,
  UpdateProjectCurrencySettingsInput
} from '@shared/types/entities'
```

Add a new `safeHandle` registration inside `registerProjectsIpc`, after the existing `projectsUpdateCurrencySettings` one:

```ts
  safeHandle(
    IPC.projectsUpdateAiModelOverride,
    (_event, input: UpdateProjectAiModelOverrideInput): Project =>
      updateProjectAiModelOverride(input.projectId, input.aiModelOverride)
  )
```

- [ ] **Step 3: Expose it in preload**

In `src/preload/index.ts`, inside the `projects: { ... }` object, add a new method after `updateCurrencySettings`:

```ts
    updateAiModelOverride: (input: UpdateProjectAiModelOverrideInput): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectsUpdateAiModelOverride, input)
```

The top of `src/preload/index.ts` has a large alphabetically-sorted type-only import from `@shared/types/entities` that already includes `UpdateProjectCurrencySettingsInput`. Add `UpdateProjectAiModelOverrideInput` to that same list, immediately **before** `UpdateProjectCurrencySettingsInput` (alphabetical order: "AiModelOverride" sorts before "CurrencySettings").

- [ ] **Step 4: Typecheck both projects**

Run: `npm run typecheck:node`
Expected: no errors.

Run: `npm run typecheck:web`
Expected: no errors (preload is included in the web typecheck project in this codebase — if it errors here instead, that's fine, just confirm it's clean in whichever project actually covers `src/preload/`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/projects.ipc.ts src/preload/index.ts
git commit -m "feat: add projects:updateAiModelOverride IPC endpoint"
```

---

### Task 3: Renderer query hook

**Files:**
- Modify: `src/renderer/src/state/queries/useProjects.ts`

**Interfaces:**
- Consumes: `window.api.projects.updateAiModelOverride` (Task 2), `UpdateProjectAiModelOverrideInput` (Task 1).
- Produces (consumed by Task 5):

```ts
export function useUpdateProjectAiModelOverride(): UseMutationResult<
  Project,
  Error,
  UpdateProjectAiModelOverrideInput
>
```

- [ ] **Step 1: Add the hook**

In `src/renderer/src/state/queries/useProjects.ts`, add `UpdateProjectAiModelOverrideInput` to the type-only import from `@shared/types/entities` (alongside the existing `UpdateProjectCurrencySettingsInput`), then add this function after `useUpdateProjectCurrencySettings`:

```ts
export function useUpdateProjectAiModelOverride(): UseMutationResult<
  Project,
  Error,
  UpdateProjectAiModelOverrideInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProjectAiModelOverrideInput) =>
      window.api.projects.updateAiModelOverride(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/state/queries/useProjects.ts
git commit -m "feat: add useUpdateProjectAiModelOverride renderer hook"
```

---

### Task 4: Effective-model computation in the extraction path

**Files:**
- Modify: `src/main/ipc/ai.ipc.ts`

**Interfaces:**
- Consumes: `getProjectById` (existing, from `projectsRepo.ts`), `Project.aiModelOverride` (Task 1).
- Produces: nothing new consumed by later tasks — this is a self-contained backend behavior change.

- [ ] **Step 1: Import `getProjectById`**

In `src/main/ipc/ai.ipc.ts`, update the existing import from `'../db/repositories/sldsRepo'`... actually `getSldById` is already imported from there. Add a new import line for the project lookup:

```ts
import { getProjectById } from '../db/repositories/projectsRepo'
```

- [ ] **Step 2: Change `getProvider` to take the effective model as a parameter**

Replace the existing `getProvider` function:

```ts
function getProvider(): AIProvider {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new AppError('AI_NO_API_KEY')
  }
  const { aiModel } = getSettings()
  const cacheKey = `${apiKey}:${aiModel}`
  if (!provider || providerCacheKey !== cacheKey) {
    provider = new ClaudeProvider(apiKey, aiModel)
    providerCacheKey = cacheKey
  }
  return provider
}
```

with:

```ts
function getProvider(effectiveModel: string): AIProvider {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new AppError('AI_NO_API_KEY')
  }
  const cacheKey = `${apiKey}:${effectiveModel}`
  if (!provider || providerCacheKey !== cacheKey) {
    provider = new ClaudeProvider(apiKey, effectiveModel)
    providerCacheKey = cacheKey
  }
  return provider
}
```

- [ ] **Step 3: Compute the effective model in the extraction handler and pass it through**

In the `IPC.aiExtractSld` handler, `sld` is already fetched at the top (`const sld = getSldById(sldId)`). Immediately after the existing `const { enabledComponentTypes, maxExtractionRetries, preferredBrands, customExtractionRules } = getSettings()` line, add:

```ts
        const project = getProjectById(sld.projectId)
        const effectiveModel = project?.aiModelOverride ?? getSettings().aiModel
```

Change the `const provider = getProvider()` line to:

```ts
        const provider = getProvider(effectiveModel)
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

- [ ] **Step 5: Run the existing test suites to confirm nothing broke**

Run: `npm test`
Expected: PASS (21 tests, unchanged — this file has no existing dedicated test, but nothing it touches should regress).

Run: `npm run test:db`
Expected: PASS (all tests including the 3 new ones from Task 1).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/ai.ipc.ts
git commit -m "feat: use per-project AI model override when extracting, falling back to the global default"
```

---

### Task 5: UI — project prop threading and the ExtractionPanel control

**Files:**
- Modify: `src/renderer/src/components/layout/CenterPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/pdf/ExtractionPanel.tsx`

**Interfaces:**
- Consumes: `useUpdateProjectAiModelOverride` (Task 3), `AVAILABLE_AI_MODELS`/`DEFAULT_AI_MODEL` (existing, `src/shared/constants/aiModels.ts`), `useSettings` (existing, `src/renderer/src/state/queries/useSettings.ts`), `Project` type (Task 1).
- Produces: nothing consumed by later tasks — this is the final UI wiring.

- [ ] **Step 1: Thread `project` through `CenterPanel`**

In `src/renderer/src/components/layout/CenterPanel.tsx`, add `Project` to the type-only import from `@shared/types/entities` (it currently imports `Annotation, PanelMode, Sld` — add `Project` to that list).

Add `project: Project | null` to `CenterPanelProps` (after `sld: Sld | null`), and destructure it in the function signature (after `sld`):

```ts
interface CenterPanelProps {
  sld: Sld | null
  project: Project | null
  panelMode: PanelMode
  onPanelModeChange: (mode: PanelMode) => void
}
```

```ts
export function CenterPanel({
  sld,
  project,
  panelMode,
  onPanelModeChange
}: CenterPanelProps): React.JSX.Element {
```

Pass it down to `ExtractionPanel` at its existing call site:

```tsx
            <ExtractionPanel key={`extraction-${sld.id}`} sldId={sld.id} project={project} />
```

- [ ] **Step 2: Pass `selectedProject` from `App.tsx`**

In `src/renderer/src/App.tsx`, at the existing `<CenterPanel ... />` usage, add the `project` prop:

```tsx
          <CenterPanel
            sld={selectedSld}
            project={selectedProject}
            panelMode={panelMode}
            onPanelModeChange={setPanelMode}
          />
```

(`selectedProject` already exists in `App.tsx` — computed at `const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null`.)

- [ ] **Step 3: Typecheck (expected to fail until Step 4 lands)**

Run: `npm run typecheck:web`
Expected: FAIL — `ExtractionPanel` doesn't accept a `project` prop yet. Confirm the error is specifically that missing-prop error on the `<ExtractionPanel ...>` usage in `CenterPanel.tsx`.

- [ ] **Step 4: Add the control to `ExtractionPanel`**

In `src/renderer/src/components/pdf/ExtractionPanel.tsx`:

Add these imports (after the existing ones):

```ts
import { useSettings } from '@renderer/state/queries/useSettings'
import { useUpdateProjectAiModelOverride } from '@renderer/state/queries/useProjects'
import { AVAILABLE_AI_MODELS } from '@shared/constants/aiModels'
import type { Project } from '@shared/types/entities'
```

Update the props interface and function signature:

```ts
interface ExtractionPanelProps {
  sldId: string
  project: Project | null
}

export function ExtractionPanel({ sldId, project }: ExtractionPanelProps): React.JSX.Element {
```

Inside the component, after the existing `const { data: extraction } = useExtraction(sldId)` line, add:

```ts
  const { data: settings } = useSettings()
  const updateAiModelOverride = useUpdateProjectAiModelOverride()
  const globalModelLabel =
    AVAILABLE_AI_MODELS.find((m) => m.id === settings?.aiModel)?.label ?? settings?.aiModel ?? '—'
```

Add the control's JSX right after the closing `</div>` of the header row (the `flex items-center justify-between` div containing the "AI extraction" label and the Generate/Re-extract button) and before the `{running && (...)}` block:

```tsx
      {project && (
        <div className="flex items-center gap-2 text-xs">
          <label className="text-text-muted" htmlFor={`ai-model-override-${project.id}`}>
            Project AI model (applies to every SLD in this project)
          </label>
          <select
            id={`ai-model-override-${project.id}`}
            value={project.aiModelOverride ?? ''}
            onChange={(e) =>
              updateAiModelOverride.mutate({
                projectId: project.id,
                aiModelOverride: e.target.value === '' ? null : e.target.value
              })
            }
            className="h-7 rounded border border-border-strong bg-surface px-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Use global default (currently: {globalModelLabel})</option>
            {AVAILABLE_AI_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors on the files touched in this task (the codebase has pre-existing unrelated CRLF warnings and a couple of pre-existing `setState`-in-effect errors elsewhere — confirm any error shown is not on a line this task touched, same check used for the project-switcher work).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/layout/CenterPanel.tsx src/renderer/src/App.tsx src/renderer/src/components/pdf/ExtractionPanel.tsx
git commit -m "feat: add project AI model override control to ExtractionPanel"
```

---

### Task 6: Live verification

**Files:** none (manual verification only — no code changes).

- [ ] **Step 1: Start the app**

Run: `npm run dev` (main-process files changed in this plan — `src/main/ipc/ai.ipc.ts`, migrations — so if a dev server is already running, it needs a manual restart per this codebase's known electron-vite file-watcher limitation; renderer-only changes hot-reload fine but don't assume that covers everything in this plan).

- [ ] **Step 2: Confirm the control renders and defaults correctly**

Open a project with at least one SLD. Confirm the "Project AI model" row appears in the SLD's extraction panel, with "Use global default (currently: <label>)" pre-selected and the label matching whatever Settings > AI Model currently shows.

- [ ] **Step 3: Set an override and confirm it persists**

Pick a different model in the dropdown. Confirm no error. Switch to a different SLD in the same project (or reload the app) and confirm the dropdown still shows the overridden model, not "Use global default" — this confirms the value round-trips through the DB rather than just being local component state.

- [ ] **Step 4: Confirm the override actually changes which model runs**

Using the throwaway test project (never the user's real project — see memory `project_build_status`, "Test data (do not touch)"), set the override to a model different from the global default, then re-run extraction on an SLD in that project (accept the "already extracted" confirmation if prompted). After it completes, inspect the resulting extraction record's `model` field (via the app's existing extraction display, or direct DB inspection of the `extractions` table) and confirm it matches the override, not the global default.

- [ ] **Step 5: Confirm clearing the override falls back to the global default**

Reselect "Use global default" in the dropdown. Re-run extraction again and confirm the resulting extraction's `model` field now matches the global Settings > AI Model value instead.

- [ ] **Step 6: Report results and update roadmap memory**

If all steps pass, report to the user. Update the `project_remaining_stages_roadmap` memory file: mark item 4 (per-project AI model override) complete, note the commit range, and set "next up" to item 5 (packaging/installer verification — the final item).
