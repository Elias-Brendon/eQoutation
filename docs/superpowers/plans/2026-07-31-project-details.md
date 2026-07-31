# Project Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add richer per-project metadata (title reuse, sector, auto-generated quotation number, company, coordinator, status, enquiry date reuse, created-by) with a Details modal to view/edit it, two new user-configurable dropdown-option lists in Settings, and a cover sheet on every exported quotation workbook.

**Architecture:** DB-backed fields on `projects` (migration 0024) plus two new plain string-list fields on the existing JSON `AppSettings` store. One combined `projects:updateDetails` IPC endpoint handles all five editable Details fields (unlike the earlier single-field currency/AI-model-override endpoints). A new `ProjectDetailsModal` (TopBar-triggered) and two new Settings list-editor sections share a new reusable `EditableListSection` component. `quotationExcelBuilder.ts` gains a cover worksheet, inserted first, shared by both export call sites automatically.

**Tech Stack:** Electron main process (better-sqlite3, hand-rolled migrations), React 19 + TypeScript renderer, TanStack Query, ExcelJS, Vitest (`*.dbtest.ts` via `npm run test:db`).

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-31-project-details-design.md`.
- "Project Title" reuses `Project.name` (no new column). "Enquiry Date" reuses `Project.createdAt` (no new column).
- `status` reuses the same 4 string values as `QuotationStatus` (`'generating' | 'pending_review' | 'approved' | 'rejected'`) via a new `ProjectStatus` type alias, but is fully independent — never derived from any quotation's status. New projects default to `'pending_review'`.
- Quotation number format `PRJ-0001`, `PRJ-0002`, ... — computed by scanning existing `quotation_number` values and incrementing, not a stored counter. No project-delete feature exists, so no gap/reuse risk.
- `created_by` is set once at creation (from the current session's user) and never editable afterward. `coordinator` is free text, pre-filled with the current username at creation time but freely editable after.
- Sector/Company option lists (`AppSettings.projectSectors`, `AppSettings.companies`) are plain user-owned lists — add/remove any entry, no fixed baseline enum like the existing Component Types pattern has.
- No renderer component test infra exists in this codebase (confirmed repeatedly in prior roadmap work) — UI verification is manual/live. Backend logic gets automated `*.dbtest.ts` coverage.
- The migration's data backfill (assigning sequential numbers to pre-existing project rows) is a one-time SQL statement verified by direct reasoning, not by a simulated automated test — the existing migration-test harness (`migrations.dbtest.ts`) only ever asserts schema shape (columns exist), never pre/post-migration data transitions, and there's no clean way to insert rows *before* migration 0024 runs without restructuring that harness. Don't attempt to build that simulation; it's out of proportion to a one-time backfill.
- Follow existing patterns exactly: `Modal`/`Badge`/`Button`/`Input` component APIs, the migration/repo/IPC/preload/hook five-file pattern already used twice this roadmap (currency, AI model override), and the "Custom types" add/remove list interaction already in `ComponentsSection.tsx`.

**Existing code this plan depends on (current state, before this plan's changes):**

```ts
// src/shared/types/entities.ts
export type QuotationStatus = 'generating' | 'pending_review' | 'approved' | 'rejected'

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
  aiModelOverride: string | null
}

export interface CreateProjectInput {
  name: string
  substationLabel?: string
}

export interface AppSettings {
  catalogDir: string
  preferredBrands: string[]
  preferredBrandsByType: Record<string, string>
  enabledComponentTypes: string[]
  customExtractionRules: string[]
  aiModel: string
  confidenceThreshold: number
  maxExtractionRetries: number
  defaultMargin: number
  fontScale: FontScale
  annotationFontSize: number
}

// src/main/db/repositories/projectsRepo.ts
export function getProjectById(id: string): Project | null

// src/main/auth/authState.ts
export function getCurrentUserId(): string | null

// src/main/db/repositories/usersRepo.ts
export function getUserById(id: string): AuthUser | null  // AuthUser has { id, username, role, hasRecoveryQuestion }

// src/renderer/src/components/common/Modal.tsx
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

// src/renderer/src/components/common/Input.tsx — forwardRef wrapping <input>, accepts all standard input props + className

// src/renderer/src/components/common/Button.tsx — accepts variant ('outline'|'accent'|'ghost'|'success'|'danger'), size ('sm'|'md'), onClick, disabled, title, className, children

// src/main/quotation/quotationExcelBuilder.ts — writeQuotationWorkbook(quotation, project, sld) already called by both
// src/main/ipc/quotations.ipc.ts (single-quotation export) and src/main/export/projectExporter.ts (full project export bundle)
```

---

### Task 1: DB migration, shared types, and repo functions

**Files:**
- Create: `src/main/db/migrations/0024_project_details.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/shared/types/entities.ts`
- Create: `src/shared/constants/projectStatus.ts`
- Modify: `src/main/db/repositories/projectsRepo.ts`
- Modify: `src/main/db/repositories/projectsRepo.dbtest.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 2 and later):

```ts
// src/shared/types/entities.ts additions
export type ProjectStatus = QuotationStatus

export interface Project {
  // ...all existing fields, plus:
  sector: string | null
  quotationNumber: string
  company: string | null
  coordinator: string | null
  status: ProjectStatus
  createdBy: string | null
}

export interface CreateProjectInput {
  name: string
  substationLabel?: string
  sector?: string
  company?: string
  coordinator?: string
}

export interface UpdateProjectDetailsInput {
  projectId: string
  name?: string
  sector?: string | null
  company?: string | null
  coordinator?: string | null
  status?: ProjectStatus
}

// src/shared/constants/projectStatus.ts
export const PROJECT_STATUSES: ProjectStatus[]
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string>

// src/main/db/repositories/projectsRepo.ts
export function createProject(input: CreateProjectInput, createdBy: string | null): Project
export function updateProjectDetails(
  id: string,
  patch: Partial<{
    name: string
    sector: string | null
    company: string | null
    coordinator: string | null
    status: ProjectStatus
  }>
): Project
```

- [ ] **Step 1: Write the failing tests**

Add to `src/main/db/repositories/projectsRepo.dbtest.ts` (append a new `describe` block after the existing `aiModelOverride` one):

```ts
describe('projectsRepo project details', () => {
  it('assigns sequential quotation numbers starting at PRJ-0001', () => {
    const first = createProject({ name: 'First' })
    const second = createProject({ name: 'Second' })
    expect(first.quotationNumber).toBe('PRJ-0001')
    expect(second.quotationNumber).toBe('PRJ-0002')
  })

  it('defaults status to pending_review and sector/company/coordinator to null when not provided', () => {
    const project = createProject({ name: 'Test Project' })
    expect(project.status).toBe('pending_review')
    expect(project.sector).toBeNull()
    expect(project.company).toBeNull()
    expect(project.coordinator).toBeNull()
  })

  it('stores sector, company, and coordinator when provided at creation', () => {
    const project = createProject({
      name: 'Test Project',
      sector: 'Data Centre',
      company: 'Acme Corp',
      coordinator: 'elias'
    })
    expect(project.sector).toBe('Data Centre')
    expect(project.company).toBe('Acme Corp')
    expect(project.coordinator).toBe('elias')
  })

  it('sets createdBy from the value passed in and never changes it via updateProjectDetails', () => {
    const project = createProject({ name: 'Test Project' }, 'elias')
    expect(project.createdBy).toBe('elias')

    const updated = updateProjectDetails(project.id, { name: 'Renamed' })
    expect(updated.createdBy).toBe('elias')
  })

  it('updates only the fields present in the patch, leaving others untouched', () => {
    const project = createProject({ name: 'Test Project', sector: 'Industrial' })

    const updated = updateProjectDetails(project.id, { company: 'Acme Corp' })
    expect(updated.company).toBe('Acme Corp')
    expect(updated.sector).toBe('Industrial')
    expect(updated.name).toBe('Test Project')
  })

  it('updates status', () => {
    const project = createProject({ name: 'Test Project' })
    const updated = updateProjectDetails(project.id, { status: 'approved' })
    expect(updated.status).toBe('approved')
  })
})
```

Update the import at the top of the file to include the new function:

```ts
import {
  createProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectDetails
} from './projectsRepo'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db`
Expected: FAIL — `updateProjectDetails` is not exported, and `createProject` doesn't yet accept a second `createdBy` argument or the new input fields (this also won't typecheck cleanly yet — expected at this point).

- [ ] **Step 3: Create the migration**

Create `src/main/db/migrations/0024_project_details.ts`:

```ts
export const sql = `
ALTER TABLE projects ADD COLUMN sector TEXT NULL;
ALTER TABLE projects ADD COLUMN quotation_number TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN company TEXT NULL;
ALTER TABLE projects ADD COLUMN coordinator TEXT NULL;
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_review';
ALTER TABLE projects ADD COLUMN created_by TEXT NULL;

UPDATE projects
SET quotation_number = 'PRJ-' || substr('0000' || (
  SELECT COUNT(*)
  FROM projects AS p2
  WHERE p2.created_at < projects.created_at
     OR (p2.created_at = projects.created_at AND p2.id <= projects.id)
), -4, 4);
`
```

(The `UPDATE` backfills any projects that existed before this migration with sequential numbers in creation order — new projects created after this migration get their number from `createProject`/`nextQuotationNumber`, not this statement.)

- [ ] **Step 4: Register the migration**

In `src/main/db/migrations/index.ts`, add the import after the `m0023` import:

```ts
import { sql as m0024 } from './0024_project_details'
```

Add the entry after the version-23 entry in the `migrations` array:

```ts
  { version: 24, name: '0024_project_details', sql: m0024 }
```

- [ ] **Step 5: Add the shared types**

In `src/shared/types/entities.ts`, add right after the `QuotationStatus` line:

```ts
/** Project-level status, independent of any individual quotation's status — reuses the same 4 values for label/UI consistency. */
export type ProjectStatus = QuotationStatus
```

Add the six new fields to the `Project` interface (after `aiModelOverride`):

```ts
  sector: string | null
  quotationNumber: string
  company: string | null
  coordinator: string | null
  status: ProjectStatus
  createdBy: string | null
```

Add three new optional fields to `CreateProjectInput`:

```ts
export interface CreateProjectInput {
  name: string
  substationLabel?: string
  sector?: string
  company?: string
  coordinator?: string
}
```

Add a new interface after `UpdateProjectAiModelOverrideInput`:

```ts
export interface UpdateProjectDetailsInput {
  projectId: string
  name?: string
  sector?: string | null
  company?: string | null
  coordinator?: string | null
  status?: ProjectStatus
}
```

- [ ] **Step 6: Create the shared status-label constant**

Create `src/shared/constants/projectStatus.ts`:

```ts
import type { ProjectStatus } from '../types/entities'

// Shared between the renderer (Details modal dropdown) and the main
// process (Excel cover sheet), which is why this lives in shared/ rather
// than the renderer-only src/renderer/src/lib/statusMeta.ts.
export const PROJECT_STATUSES: ProjectStatus[] = [
  'generating',
  'pending_review',
  'approved',
  'rejected'
]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  generating: 'Generating…',
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected'
}
```

- [ ] **Step 7: Update the repo**

In `src/main/db/repositories/projectsRepo.ts`:

Update the type-only import to include `ProjectStatus`:

```ts
import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  UpdateProjectCurrencySettingsInput
} from '@shared/types/entities'
```

Add six fields to `ProjectRow` (after `ai_model_override`):

```ts
  sector: string | null
  quotation_number: string
  company: string | null
  coordinator: string | null
  status: string
  created_by: string | null
```

In `toProject`, add (after `aiModelOverride: row.ai_model_override`):

```ts
    sector: row.sector,
    quotationNumber: row.quotation_number,
    company: row.company,
    coordinator: row.coordinator,
    status: row.status as ProjectStatus,
    createdBy: row.created_by
```

Add a new private helper right before `createProject`:

```ts
function nextQuotationNumber(): string {
  const rows = getDb()
    .prepare('SELECT quotation_number FROM projects')
    .all() as { quotation_number: string }[]
  const maxN = rows.reduce((max, row) => {
    const match = /^PRJ-(\d+)$/.exec(row.quotation_number)
    const n = match ? parseInt(match[1], 10) : 0
    return Math.max(max, n)
  }, 0)
  return `PRJ-${String(maxN + 1).padStart(4, '0')}`
}
```

Replace the `createProject` function signature and body:

```ts
export function createProject(input: CreateProjectInput, createdBy: string | null = null): Project {
  const now = new Date().toISOString()
  const row: ProjectRow = {
    id: randomUUID(),
    name: input.name,
    substation_label: input.substationLabel ?? '',
    currency: 'MYR',
    exchange_rate: 1,
    exchange_rate_is_manual: 0,
    exchange_rate_updated_at: null,
    ai_progress_pct: 0,
    created_at: now,
    updated_at: now,
    ai_model_override: null,
    sector: input.sector ?? null,
    quotation_number: nextQuotationNumber(),
    company: input.company ?? null,
    coordinator: input.coordinator ?? null,
    status: 'pending_review',
    created_by: createdBy
  }

  getDb()
    .prepare(
      `INSERT INTO projects
         (id, name, substation_label, currency, exchange_rate, exchange_rate_is_manual,
          exchange_rate_updated_at, ai_progress_pct, created_at, updated_at, ai_model_override,
          sector, quotation_number, company, coordinator, status, created_by)
       VALUES
         (@id, @name, @substation_label, @currency, @exchange_rate, @exchange_rate_is_manual,
          @exchange_rate_updated_at, @ai_progress_pct, @created_at, @updated_at, @ai_model_override,
          @sector, @quotation_number, @company, @coordinator, @status, @created_by)`
    )
    .run(row)

  return toProject(row)
}
```

(`createdBy` defaults to `null` so existing test calls like `createProject({ name: 'X' })` from the earlier `aiModelOverride` describe block keep compiling unchanged.)

Add a new function at the end of the file:

```ts
export function updateProjectDetails(
  id: string,
  patch: Partial<{
    name: string
    sector: string | null
    company: string | null
    coordinator: string | null
    status: ProjectStatus
  }>
): Project {
  const fields: string[] = []
  const params: Record<string, unknown> = { id }
  if (patch.name !== undefined) {
    fields.push('name = @name')
    params.name = patch.name
  }
  if (patch.sector !== undefined) {
    fields.push('sector = @sector')
    params.sector = patch.sector
  }
  if (patch.company !== undefined) {
    fields.push('company = @company')
    params.company = patch.company
  }
  if (patch.coordinator !== undefined) {
    fields.push('coordinator = @coordinator')
    params.coordinator = patch.coordinator
  }
  if (patch.status !== undefined) {
    fields.push('status = @status')
    params.status = patch.status
  }
  if (fields.length > 0) {
    getDb()
      .prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = @id`)
      .run(params)
  }
  return getProjectById(id) as Project
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:db`
Expected: PASS (all new tests, plus the existing suite still green).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/main/db/migrations/0024_project_details.ts src/main/db/migrations/index.ts src/shared/types/entities.ts src/shared/constants/projectStatus.ts src/main/db/repositories/projectsRepo.ts src/main/db/repositories/projectsRepo.dbtest.ts
git commit -m "feat: add project details fields, quotation numbering, and repo functions"
```

---

### Task 2: IPC endpoint and preload

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/projects.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `updateProjectDetails`, `createProject` (Task 1), `getCurrentUserId` (`src/main/auth/authState.ts`, existing), `getUserById` (`src/main/db/repositories/usersRepo.ts`, existing).
- Produces (consumed by Task 3):

```ts
// window.api.projects.updateDetails, callable from the renderer
updateDetails(input: UpdateProjectDetailsInput): Promise<Project>
```

- [ ] **Step 1: Add the IPC channel name**

In `src/shared/types/ipc-contract.ts`, add a line right after `projectsUpdateAiModelOverride: 'projects:updateAiModelOverride',`:

```ts
  projectsUpdateDetails: 'projects:updateDetails',
```

- [ ] **Step 2: Register the main-process handler and compute `createdBy` on create**

Replace `src/main/ipc/projects.ipc.ts` in full:

```ts
import { getCurrentUserId } from '../auth/authState'
import { getUserById } from '../db/repositories/usersRepo'
import {
  createProject,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectCurrencySettings,
  updateProjectDetails
} from '../db/repositories/projectsRepo'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type {
  CreateProjectInput,
  Project,
  UpdateProjectAiModelOverrideInput,
  UpdateProjectCurrencySettingsInput,
  UpdateProjectDetailsInput
} from '@shared/types/entities'

function currentUsername(): string | null {
  const userId = getCurrentUserId()
  return userId ? (getUserById(userId)?.username ?? null) : null
}

export function registerProjectsIpc(): void {
  safeHandle(IPC.projectsList, () => listProjects())
  safeHandle(
    IPC.projectsCreate,
    (_event, input: CreateProjectInput): Project => createProject(input, currentUsername())
  )
  safeHandle(
    IPC.projectsUpdateCurrencySettings,
    (_event, input: UpdateProjectCurrencySettingsInput): Project =>
      updateProjectCurrencySettings(input.projectId, {
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        exchangeRateIsManual: input.exchangeRateIsManual
      })
  )
  safeHandle(
    IPC.projectsUpdateAiModelOverride,
    (_event, input: UpdateProjectAiModelOverrideInput): Project =>
      updateProjectAiModelOverride(input.projectId, input.aiModelOverride)
  )
  safeHandle(
    IPC.projectsUpdateDetails,
    (_event, input: UpdateProjectDetailsInput): Project =>
      updateProjectDetails(input.projectId, {
        name: input.name,
        sector: input.sector,
        company: input.company,
        coordinator: input.coordinator,
        status: input.status
      })
  )
}
```

- [ ] **Step 3: Expose it in preload**

In `src/preload/index.ts`, the large alphabetically-sorted type-only import already includes `UpdateProjectAiModelOverrideInput` and `UpdateProjectCurrencySettingsInput`. Add `UpdateProjectDetailsInput` immediately **after** `UpdateProjectCurrencySettingsInput` (alphabetical: "Details" sorts after "CurrencySettings").

In the `projects: { ... }` object, add a new method after `updateAiModelOverride`:

```ts
    updateDetails: (input: UpdateProjectDetailsInput): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectsUpdateDetails, input)
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 5: Run the DB test suite to confirm nothing broke**

Run: `npm run test:db`
Expected: PASS (all tests from Task 1 plus the rest of the existing suite).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/projects.ipc.ts src/preload/index.ts
git commit -m "feat: add projects:updateDetails IPC endpoint, capture creator username on project creation"
```

---

### Task 3: Renderer query hook

**Files:**
- Modify: `src/renderer/src/state/queries/useProjects.ts`

**Interfaces:**
- Consumes: `window.api.projects.updateDetails` (Task 2), `UpdateProjectDetailsInput` (Task 1).
- Produces (consumed by Task 6):

```ts
export function useUpdateProjectDetails(): UseMutationResult<Project, Error, UpdateProjectDetailsInput>
```

- [ ] **Step 1: Add the hook**

In `src/renderer/src/state/queries/useProjects.ts`, add `UpdateProjectDetailsInput` to the type-only import from `@shared/types/entities` (after `UpdateProjectCurrencySettingsInput`, alphabetically), then add this function at the end of the file:

```ts
export function useUpdateProjectDetails(): UseMutationResult<
  Project,
  Error,
  UpdateProjectDetailsInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProjectDetailsInput) => window.api.projects.updateDetails(input),
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
git commit -m "feat: add useUpdateProjectDetails renderer hook"
```

---

### Task 4: Settings additions — sector/company lists

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/settings/settingsStore.ts`
- Create: `src/renderer/src/components/settings/sections/EditableListSection.tsx`
- Create: `src/renderer/src/components/settings/sections/ProjectSectorsSection.tsx`
- Create: `src/renderer/src/components/settings/sections/CompaniesSection.tsx`
- Modify: `src/renderer/src/components/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `useSettings`/`useUpdateSettings` (existing, `src/renderer/src/state/queries/useSettings.ts`).
- Produces (consumed by Task 5 and Task 6): `AppSettings.projectSectors: string[]`, `AppSettings.companies: string[]`, and a reusable `EditableListSection` component:

```ts
interface EditableListSectionProps {
  title: string
  description: string
  items: string[]
  placeholder: string
  onChange: (next: string[]) => void
}
export function EditableListSection(props: EditableListSectionProps): React.JSX.Element
```

- [ ] **Step 1: Add the settings fields to the shared type**

In `src/shared/types/entities.ts`, add two fields to `AppSettings` (after `enabledComponentTypes`):

```ts
  /** Options shown in the project Sector dropdown — fully user-owned, no fixed baseline. */
  projectSectors: string[]
  /** Options shown in the project Company dropdown — fully user-owned, starts empty. */
  companies: string[]
```

- [ ] **Step 2: Add defaults and JSON round-trip in the settings store**

In `src/main/settings/settingsStore.ts`, add to `defaultSettings()` (after `enabledComponentTypes: DEFAULT_COMPONENT_TYPES,`):

```ts
    projectSectors: ['Data Centre', 'Industrial', 'Infrastructure', 'Renewable Energy', 'Semiconductor'],
    companies: [],
```

Add to `getSettings()`'s returned object (after `enabledComponentTypes: parsed.enabledComponentTypes ?? defaults.enabledComponentTypes,`):

```ts
      projectSectors: parsed.projectSectors ?? defaults.projectSectors,
      companies: parsed.companies ?? defaults.companies,
```

- [ ] **Step 3: Create the reusable list-editor component**

Create `src/renderer/src/components/settings/sections/EditableListSection.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'

interface EditableListSectionProps {
  title: string
  description: string
  items: string[]
  placeholder: string
  onChange: (next: string[]) => void
}

export function EditableListSection({
  title,
  description,
  items,
  placeholder,
  onChange
}: EditableListSectionProps): React.JSX.Element {
  const [newItem, setNewItem] = useState('')

  const removeItem = (item: string): void => {
    onChange(items.filter((i) => i !== item))
  }

  const handleAdd = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = newItem.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed])
    setNewItem('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <div key={item} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-text-secondary">{item}</span>
              <button
                onClick={() => removeItem(item)}
                className="text-text-muted hover:text-danger"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="max-w-64"
        />
        <Button type="submit" variant="outline" size="sm">
          Add
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Create the two settings sections**

Create `src/renderer/src/components/settings/sections/ProjectSectorsSection.tsx`:

```tsx
import { EditableListSection } from './EditableListSection'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function ProjectSectorsSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <EditableListSection
      title="Project Sectors"
      description="Options shown in the project Sector dropdown. Add, remove, or rename to match how you categorize work."
      items={settings?.projectSectors ?? []}
      placeholder="Add a sector…"
      onChange={(next) => updateSettings.mutate({ projectSectors: next })}
    />
  )
}
```

Create `src/renderer/src/components/settings/sections/CompaniesSection.tsx`:

```tsx
import { EditableListSection } from './EditableListSection'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function CompaniesSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <EditableListSection
      title="Companies"
      description="Options shown in the project Company dropdown. Add the client/company names you quote for."
      items={settings?.companies ?? []}
      placeholder="Add a company…"
      onChange={(next) => updateSettings.mutate({ companies: next })}
    />
  )
}
```

- [ ] **Step 5: Wire both into the Settings nav**

In `src/renderer/src/components/settings/SettingsPage.tsx`, add imports after the `ComponentsSection` import:

```ts
import { ProjectSectorsSection } from './sections/ProjectSectorsSection'
import { CompaniesSection } from './sections/CompaniesSection'
```

Add two values to the `SectionId` union (after `'components'`):

```ts
  | 'projectSectors'
  | 'companies'
```

Add two entries to `NAV_ITEMS` (after the `components` entry):

```ts
  { id: 'projectSectors', label: 'Project Sectors' },
  { id: 'companies', label: 'Companies' },
```

Add two render branches (after the `components` branch):

```tsx
          {activeSection === 'projectSectors' && <ProjectSectorsSection />}
          {activeSection === 'companies' && <CompaniesSection />}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/entities.ts src/main/settings/settingsStore.ts src/renderer/src/components/settings/sections/EditableListSection.tsx src/renderer/src/components/settings/sections/ProjectSectorsSection.tsx src/renderer/src/components/settings/sections/CompaniesSection.tsx src/renderer/src/components/settings/SettingsPage.tsx
git commit -m "feat: add user-configurable Project Sectors and Companies settings lists"
```

---

### Task 5: CreateProjectDialog additions

**Files:**
- Modify: `src/renderer/src/components/layout/CreateProjectDialog.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useSettings` (existing), `CreateProjectInput` (Task 1) — the extended `sector`/`company`/`coordinator` fields.
- Produces: a new required prop on `CreateProjectDialog`, consumed only within this task's own `App.tsx` change:

```ts
interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => void
  currentUsername: string | null
}
```

- [ ] **Step 1: Replace `CreateProjectDialog.tsx` in full**

```tsx
import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useCreateProject } from '@renderer/state/queries/useProjects'
import { useSettings } from '@renderer/state/queries/useSettings'

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => void
  currentUsername: string | null
}

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  currentUsername
}: CreateProjectDialogProps): React.JSX.Element {
  const { data: settings } = useSettings()
  const [name, setName] = useState('')
  const [substationLabel, setSubstationLabel] = useState('')
  const [sector, setSector] = useState('')
  const [company, setCompany] = useState('')
  const [coordinator, setCoordinator] = useState(currentUsername ?? '')
  const createProject = useCreateProject()

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) return
    const project = await createProject.mutateAsync({
      name: name.trim(),
      substationLabel: substationLabel.trim(),
      sector: sector || undefined,
      company: company || undefined,
      coordinator: coordinator.trim() || undefined
    })
    setName('')
    setSubstationLabel('')
    setSector('')
    setCompany('')
    setCoordinator(currentUsername ?? '')
    onCreated(project.id)
  }

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Project name</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Substation A — Phase 2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Label (optional)</label>
          <Input
            value={substationLabel}
            onChange={(e) => setSubstationLabel(e.target.value)}
            placeholder="Line Diagram Review"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Sector (optional)</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {(settings?.projectSectors ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Company (optional)</label>
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {(settings?.companies ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Coordinator (optional)</label>
          <Input
            value={coordinator}
            onChange={(e) => setCoordinator(e.target.value)}
            placeholder="Coordinator name"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            disabled={!name.trim() || createProject.isPending}
          >
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 2: Pass `currentUsername` from `App.tsx`**

In `src/renderer/src/App.tsx`, update the `<CreateProjectDialog ... />` usage (it currently has `open`, `onClose`, `onCreated`):

```tsx
        <CreateProjectDialog
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={(projectId) => {
            selectProject(projectId)
            setCreateProjectOpen(false)
          }}
          currentUsername={authStatus?.user?.username ?? null}
        />
```

(`authStatus` already exists in `App.tsx` and its `user?.username` is already used for `TopBar`'s `username` prop at the same value.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/CreateProjectDialog.tsx src/renderer/src/App.tsx
git commit -m "feat: add sector, company, and coordinator fields to project creation"
```

---

### Task 6: ProjectDetailsModal and TopBar trigger

**Files:**
- Create: `src/renderer/src/components/layout/ProjectDetailsModal.tsx`
- Modify: `src/renderer/src/components/layout/TopBar.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useUpdateProjectDetails` (Task 3), `PROJECT_STATUSES`/`PROJECT_STATUS_LABELS` (Task 1), `useSettings` (existing).
- Produces: nothing consumed by later tasks — this is the final UI wiring for the in-app side.

- [ ] **Step 1: Create `ProjectDetailsModal`**

Create `src/renderer/src/components/layout/ProjectDetailsModal.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { Input } from '@renderer/components/common/Input'
import { useSettings } from '@renderer/state/queries/useSettings'
import { useUpdateProjectDetails } from '@renderer/state/queries/useProjects'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@shared/constants/projectStatus'
import type { Project, ProjectStatus } from '@shared/types/entities'

interface ProjectDetailsModalProps {
  open: boolean
  onClose: () => void
  project: Project | null
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-muted">{label}</label>
      {children}
    </div>
  )
}

const selectClassName =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none'

export function ProjectDetailsModal({
  open,
  onClose,
  project
}: ProjectDetailsModalProps): React.JSX.Element | null {
  const { data: settings } = useSettings()
  const updateDetails = useUpdateProjectDetails()

  const [name, setName] = useState('')
  const [coordinator, setCoordinator] = useState('')

  useEffect(() => {
    if (!project) return
    setName(project.name)
    setCoordinator(project.coordinator ?? '')
  }, [project?.id, project?.name, project?.coordinator])

  if (!project) return null

  const commitName = (): void => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) {
      setName(project.name)
      return
    }
    updateDetails.mutate({ projectId: project.id, name: trimmed })
  }

  const commitCoordinator = (): void => {
    const currentValue = project.coordinator ?? ''
    if (coordinator === currentValue) return
    updateDetails.mutate({ projectId: project.id, coordinator: coordinator.trim() || null })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Project Details"
      className="w-[440px] max-w-[90vw]"
    >
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </Field>

        <Field label="Sector">
          <select
            value={project.sector ?? ''}
            onChange={(e) =>
              updateDetails.mutate({ projectId: project.id, sector: e.target.value || null })
            }
            className={selectClassName}
          >
            <option value="">—</option>
            {(settings?.projectSectors ?? []).map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quotation #">
          <div className="flex h-9 items-center font-mono text-sm text-text-secondary">
            {project.quotationNumber}
          </div>
        </Field>

        <Field label="Company">
          <select
            value={project.company ?? ''}
            onChange={(e) =>
              updateDetails.mutate({ projectId: project.id, company: e.target.value || null })
            }
            className={selectClassName}
          >
            <option value="">—</option>
            {(settings?.companies ?? []).map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Coordinator">
          <Input
            value={coordinator}
            onChange={(e) => setCoordinator(e.target.value)}
            onBlur={commitCoordinator}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </Field>

        <Field label="Status">
          <select
            value={project.status}
            onChange={(e) =>
              updateDetails.mutate({
                projectId: project.id,
                status: e.target.value as ProjectStatus
              })
            }
            className={selectClassName}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Enquiry Date">
          <div className="flex h-9 items-center text-sm text-text-secondary">
            {new Date(project.createdAt).toLocaleDateString()}
          </div>
        </Field>

        <Field label="Created by">
          <div className="flex h-9 items-center text-sm text-text-secondary">
            {project.createdBy ?? '—'}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Add the "Details" button and prop to `TopBar`**

In `src/renderer/src/components/layout/TopBar.tsx`, add `Info` to the `lucide-react` import (currently `Archive, Database, Flag, Loader2, Plus, RefreshCw, Upload, User`):

```ts
import { Archive, Database, Flag, Info, Loader2, Plus, RefreshCw, Upload, User } from 'lucide-react'
```

Add `onOpenProjectDetails: () => void` to `TopBarProps` (after `onOpenProjectSwitcher`), and to the destructured function signature.

Add a new `Button` right after the existing "Catalog" button (before "Export project"):

```tsx
      <Button
        variant="outline"
        size="md"
        onClick={onOpenProjectDetails}
        disabled={!project}
        title={project ? 'View project details' : undefined}
        aria-label="Project details"
      >
        <Info className="h-4 w-4" />
        {!compact && 'Details'}
      </Button>
```

- [ ] **Step 3: Wire the modal into `App.tsx`**

Add the import (after `ProjectSwitcherModal`):

```ts
import { ProjectDetailsModal } from '@renderer/components/layout/ProjectDetailsModal'
```

Add the open/close state next to `projectSwitcherOpen`:

```ts
  const [projectDetailsOpen, setProjectDetailsOpen] = useState(false)
```

Pass the trigger to `TopBar` (after `onOpenProjectSwitcher`):

```tsx
          onOpenProjectDetails={() => setProjectDetailsOpen(true)}
```

Render the modal next to `ProjectSwitcherModal`:

```tsx
        <ProjectDetailsModal
          open={projectDetailsOpen}
          onClose={() => setProjectDetailsOpen(false)}
          project={selectedProject}
        />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors on the files touched in this task (pre-existing unrelated CRLF warnings and the known `setState`-in-effect errors in `App.tsx`/`TopBar.tsx`'s `CurrencyField` are expected and not from this task — same check used for the two prior roadmap items).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/layout/ProjectDetailsModal.tsx src/renderer/src/components/layout/TopBar.tsx src/renderer/src/App.tsx
git commit -m "feat: add Project Details modal and TopBar trigger"
```

---

### Task 7: Excel cover sheet

**Files:**
- Modify: `src/main/quotation/quotationExcelBuilder.ts`

**Interfaces:**
- Consumes: `PROJECT_STATUS_LABELS` (Task 1), extended `Project` type (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

In `src/main/quotation/quotationExcelBuilder.ts`, add after the existing `convertFromBase` import:

```ts
import { PROJECT_STATUS_LABELS } from '@shared/constants/projectStatus'
```

- [ ] **Step 2: Add the cover sheet writer**

Add this function right before `export async function writeQuotationWorkbook`:

```ts
function writeCoverSheet(sheet: ExcelJS.Worksheet, project: Project): void {
  sheet.mergeCells('A1:B1')
  sheet.getCell('A1').value = project.name
  sheet.getCell('A1').font = { bold: true, size: 16 }

  const rows: [string, string][] = [
    ['Sector', project.sector ?? '—'],
    ['Quotation #', project.quotationNumber],
    ['Company', project.company ?? '—'],
    ['Coordinator', project.coordinator ?? '—'],
    ['Status', PROJECT_STATUS_LABELS[project.status]],
    ['Enquiry Date', new Date(project.createdAt).toLocaleDateString()],
    ['Created by', project.createdBy ?? '—']
  ]

  rows.forEach(([label, value], i) => {
    const rowNumber = i + 3
    sheet.getCell(`A${rowNumber}`).value = `${label}:`
    sheet.getCell(`A${rowNumber}`).font = { bold: true }
    sheet.getCell(`B${rowNumber}`).value = value
  })

  sheet.getColumn(1).width = 16
  sheet.getColumn(2).width = 40
}
```

- [ ] **Step 3: Call it first in `writeQuotationWorkbook`**

Inside `writeQuotationWorkbook`, right after `const usedSheetNames = new Set<string>()` and **before** the existing `const fullBomSheet = ...` line, insert:

```ts
  const coverSheet = workbook.addWorksheet(sanitizeSheetName('Project Details', usedSheetNames))
  writeCoverSheet(coverSheet, project)

```

(This makes the cover sheet the first-added worksheet, so it's the default active tab when the file opens — everything after it, including the existing `fullBomSheet` and per-panel sheets, is unchanged.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (21 tests — nothing in this file has existing unit tests, but confirm no regressions).

Run: `npm run test:db`
Expected: PASS (all tests, including Task 1's new ones).

- [ ] **Step 6: Commit**

```bash
git add src/main/quotation/quotationExcelBuilder.ts
git commit -m "feat: add project details cover sheet to exported quotation workbooks"
```

---

### Task 8: Live verification

**Files:** none (manual verification only — no code changes).

- [ ] **Step 1: Start the app**

Run: `npm run dev`. This plan touches `src/main/` (migration, IPC, settings store, Excel builder) — if a dev server is already running, restart it (this codebase's electron-vite file watcher doesn't reliably pick up main-process changes; renderer-only edits hot-reload fine but don't assume that covers this whole plan).

- [ ] **Step 2: Confirm Settings list editors**

Open Settings > Project Sectors — confirm the 5 seeded defaults (Data Centre, Industrial, Infrastructure, Renewable Energy, Semiconductor) are listed, add a custom one, remove one (including a seeded default), confirm the list updates. Repeat for Settings > Companies (starts empty), add 1–2 test company names.

- [ ] **Step 3: Confirm project creation**

Click "New Project." Confirm Sector and Company dropdowns show the lists from Step 2. Confirm Coordinator is pre-filled with your logged-in username. Create the project (only Title required, per the earlier "optional" decision — try leaving Sector/Company/Coordinator blank on one test project and filled on another).

- [ ] **Step 4: Confirm the Details modal**

Click the new "Details" button in the TopBar (next to Catalog). Confirm all 8 fields show: Title, Sector, Quotation # (should read `PRJ-0001`, `PRJ-0002`, ... incrementing per project created including ones from earlier roadmap-testing sessions — don't expect it to start at 0001 unless this is a fresh DB), Company, Coordinator, Status (defaults to "Pending review"), Enquiry Date (today's date), Created by (your username).

Edit each editable field (Title, Sector, Company, Coordinator, Status) and confirm the change persists — close and reopen the modal, or switch to another project and back, to confirm it's reading from the DB and not just local component state.

- [ ] **Step 5: Confirm the Excel cover sheet**

On a project with at least one SLD and a generated quotation, export that quotation (or export the whole project). Open the resulting `.xlsx` and confirm the **first tab** is a "Project Details" sheet (not "Full BOM") showing the project name as a large bold title and all 7 remaining fields as label/value rows below it, with correct values matching what's in the Details modal.

- [ ] **Step 6: Report results and update roadmap memory**

If everything passes, report to the user. This feature is not one of the numbered roadmap items — the roadmap's next/final item (5, packaging/installer verification) is unaffected and still pending; note in the `project_remaining_stages_roadmap` memory file that this Project Details feature was completed in between, so a future session isn't confused about why there's roadmap-adjacent work with no roadmap item number.
