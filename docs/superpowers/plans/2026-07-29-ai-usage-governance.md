# AI Usage Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track input/output token usage per extraction and per project, and require an explicit confirmed action to re-run extraction on an SLD that already has a successful extraction.

**Architecture:** A new nullable `input_tokens`/`output_tokens` pair on the `extractions` table, populated from the Anthropic SDK's `message.usage` on every terminal (done or error) extraction, summed across internal retry attempts. A new `assertCanExtract(sldId, force)` repository function enforces the once-per-SLD lock before any API call is made. A new `getProjectTokenUsage(projectId)` repository function powers a project-wide total. No dollar-cost conversion — tokens only.

**Tech Stack:** Electron main process (better-sqlite3, hand-rolled SQL migrations), Anthropic TypeScript SDK, React 19 + TanStack Query renderer, Vitest (plain-Node config for pure logic, Electron-runtime config for real-DB repo tests).

## Global Constraints

- No dollar/cost figures anywhere in this feature — token counts only (per spec non-goals).
- The internal extraction retry loop (`maxExtractionRetries` in `ai.ipc.ts`) keeps working exactly as today; the lock applies only to a *new* top-level `aiExtractSld` call after a prior one already succeeded.
- Follow the existing repo pattern: domain-rule violations throw `AppError` directly from the repository layer (see `quotationsRepo.ts` precedent), not from the IPC layer.
- DB-touching tests are `*.dbtest.ts` files run via `npm run test:db` (Electron-runtime, real `:memory:` SQLite). Pure-logic tests are `*.test.ts` run via `npm run test` (plain Node). See `vitest.config.ts` / `vitest.electron.config.ts`.

---

### Task 1: Migration — add token usage columns

**Files:**
- Create: `src/main/db/migrations/0019_extraction_token_usage.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/db/migrations.dbtest.ts`

**Interfaces:**
- Produces: `extractions.input_tokens` (INTEGER, nullable), `extractions.output_tokens` (INTEGER, nullable) — consumed by Task 2's `extractionsRepo.ts` changes.

- [ ] **Step 1: Write the migration file**

```ts
// src/main/db/migrations/0019_extraction_token_usage.ts
export const sql = `
ALTER TABLE extractions ADD COLUMN input_tokens INTEGER;
ALTER TABLE extractions ADD COLUMN output_tokens INTEGER;
`
```

- [ ] **Step 2: Register it in the migration runner**

In `src/main/db/migrations/index.ts`, add the import and array entry following the existing pattern:

```ts
import { sql as m0019 } from './0019_extraction_token_usage'
```

Add to the end of the `migrations` array:

```ts
{ version: 19, name: '0019_extraction_token_usage', sql: m0019 }
```

- [ ] **Step 3: Add a column-existence test**

In `src/main/db/migrations.dbtest.ts`, add a new test in the `describe('migration runner', ...)` block, following the existing `catalog_items` column test right above it:

```ts
  it('adds input_tokens and output_tokens columns to extractions', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(extractions)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toEqual(expect.arrayContaining(['input_tokens', 'output_tokens']))
  })
```

- [ ] **Step 4: Run the Electron-runtime test suite**

Run: `npm run test:db`
Expected: PASS, including the existing "applies every migration cleanly" test (which auto-covers the new version 19) and the new column test.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/0019_extraction_token_usage.ts src/main/db/migrations/index.ts src/main/db/migrations.dbtest.ts
git commit -m "feat: add token usage columns to extractions table"
```

---

### Task 2: Repository layer — usage persistence, project totals, rerun lock

**Files:**
- Modify: `src/main/db/repositories/extractionsRepo.ts`
- Create: `src/main/db/repositories/extractionsRepo.dbtest.ts`
- Modify: `src/shared/errors/errorCodes.ts`

**Interfaces:**
- Consumes: migration columns from Task 1 (`input_tokens`, `output_tokens` on `extractions`); `slds.project_id`, `slds.deleted_at` (existing, from `sldsRepo.ts`'s `SldRow`).
- Produces (consumed by Task 5 — `ai.ipc.ts`):
  - `export interface ExtractionUsage { inputTokens: number; outputTokens: number }`
  - `completeExtraction(id: string, model: string, payload: RawExtractionPayload, usage: ExtractionUsage | null): void` (signature change — was 3 args, now 4)
  - `failExtraction(id: string, error: string, usage: ExtractionUsage | null): void` (signature change — was 2 args, now 3)
  - `assertCanExtract(sldId: string, force: boolean): void` — throws `AppError('AI_ALREADY_EXTRACTED')` if the latest extraction for `sldId` has `status === 'done'` and `force` is falsy; no-op otherwise.
  - `getProjectTokenUsage(projectId: string): ProjectTokenUsage` — `ProjectTokenUsage` is defined in `shared/types/entities.ts` (Step 5 of this task) and imported back into `extractionsRepo.ts`, not redeclared.
- Produces (consumed by Task 6 — `shared/types/entities.ts`): `Extraction.inputTokens: number | null`, `Extraction.outputTokens: number | null` (the `toExtraction` mapper populates these).

- [ ] **Step 1: Add the new error code**

In `src/shared/errors/errorCodes.ts`, add to the `// AI extraction` section (after `AI_KEY_TEST_FAILED`):

```ts
  AI_ALREADY_EXTRACTED: { code: 'AI-009', message: 'SLD already extracted — re-extraction requires confirmation' },
```

- [ ] **Step 2: Write the failing repo tests**

Create `src/main/db/repositories/extractionsRepo.dbtest.ts`:

```ts
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import {
  assertCanExtract,
  completeExtraction,
  createRunningExtraction,
  failExtraction,
  getProjectTokenUsage
} from './extractionsRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

function createProjectWithSld(): { projectId: string; sldId: string } {
  const db = getDb()
  const now = new Date().toISOString()
  const projectId = randomUUID()
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    'Test Project',
    now,
    now
  )
  const sldId = randomUUID()
  db.prepare(
    'INSERT INTO slds (id, project_id, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sldId, projectId, 'test.pdf', now, now)
  return { projectId, sldId }
}

describe('completeExtraction / failExtraction usage persistence', () => {
  it('persists token usage on a completed extraction', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)

    completeExtraction(
      extraction.id,
      'claude-sonnet-5',
      { components: [], flags: [] },
      { inputTokens: 1000, outputTokens: 250 }
    )

    const row = getDb().prepare('SELECT input_tokens, output_tokens FROM extractions WHERE id = ?').get(
      extraction.id
    ) as { input_tokens: number; output_tokens: number }
    expect(row.input_tokens).toBe(1000)
    expect(row.output_tokens).toBe(250)
  })

  it('persists token usage on a failed extraction that still got an API response', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)

    failExtraction(extraction.id, 'Error AI-005: Response too large, cut off', {
      inputTokens: 800,
      outputTokens: 64000
    })

    const row = getDb().prepare('SELECT input_tokens, output_tokens FROM extractions WHERE id = ?').get(
      extraction.id
    ) as { input_tokens: number | null; output_tokens: number | null }
    expect(row.input_tokens).toBe(800)
    expect(row.output_tokens).toBe(64000)
  })

  it('leaves token columns null when no API response was ever received', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)

    failExtraction(extraction.id, 'Error AI-001: Anthropic API key not set', null)

    const row = getDb().prepare('SELECT input_tokens, output_tokens FROM extractions WHERE id = ?').get(
      extraction.id
    ) as { input_tokens: number | null; output_tokens: number | null }
    expect(row.input_tokens).toBeNull()
    expect(row.output_tokens).toBeNull()
  })
})

describe('getProjectTokenUsage', () => {
  it('sums tokens across multiple extractions for the project, excluding other projects', () => {
    const { projectId, sldId } = createProjectWithSld()
    const other = createProjectWithSld()

    const e1 = createRunningExtraction(sldId)
    completeExtraction(e1.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 1000,
      outputTokens: 200
    })
    const e2 = createRunningExtraction(sldId)
    failExtraction(e2.id, 'Error AI-005: Response too large, cut off', {
      inputTokens: 500,
      outputTokens: 64000
    })
    const eOther = createRunningExtraction(other.sldId)
    completeExtraction(eOther.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 9999,
      outputTokens: 9999
    })

    const usage = getProjectTokenUsage(projectId)
    expect(usage.totalInputTokens).toBe(1500)
    expect(usage.totalOutputTokens).toBe(64200)
    expect(usage.extractionCount).toBe(2)
  })

  it('excludes extractions belonging to a soft-deleted SLD', () => {
    const { projectId, sldId } = createProjectWithSld()
    const e1 = createRunningExtraction(sldId)
    completeExtraction(e1.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 100,
      outputTokens: 100
    })
    getDb()
      .prepare('UPDATE slds SET deleted_at = ? WHERE id = ?')
      .run(new Date().toISOString(), sldId)

    const usage = getProjectTokenUsage(projectId)
    expect(usage.totalInputTokens).toBe(0)
    expect(usage.totalOutputTokens).toBe(0)
    expect(usage.extractionCount).toBe(0)
  })

  it('returns zeroes for a project with no extractions', () => {
    const { projectId } = createProjectWithSld()
    const usage = getProjectTokenUsage(projectId)
    expect(usage).toEqual({ totalInputTokens: 0, totalOutputTokens: 0, extractionCount: 0 })
  })
})

describe('assertCanExtract', () => {
  it('does not throw when the SLD has never been extracted', () => {
    const { sldId } = createProjectWithSld()
    expect(() => assertCanExtract(sldId, false)).not.toThrow()
  })

  it('does not throw when the latest extraction errored', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)
    failExtraction(extraction.id, 'Error AI-007: Extraction failed', null)
    expect(() => assertCanExtract(sldId, false)).not.toThrow()
  })

  it('throws AI_ALREADY_EXTRACTED when the latest extraction succeeded and force is not set', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)
    completeExtraction(extraction.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 100,
      outputTokens: 100
    })
    expect(() => assertCanExtract(sldId, false)).toThrow('Error AI-009')
  })

  it('does not throw when the latest extraction succeeded but force is true', () => {
    const { sldId } = createProjectWithSld()
    const extraction = createRunningExtraction(sldId)
    completeExtraction(extraction.id, 'claude-sonnet-5', { components: [], flags: [] }, {
      inputTokens: 100,
      outputTokens: 100
    })
    expect(() => assertCanExtract(sldId, true)).not.toThrow()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:db`
Expected: FAIL — `assertCanExtract`, `getProjectTokenUsage` not exported; `completeExtraction`/`failExtraction` called with the wrong arity.

- [ ] **Step 4: Implement the repository changes**

Replace the contents of `src/main/db/repositories/extractionsRepo.ts`:

```ts
import { randomUUID } from 'crypto'
import { getDb } from '../index'
import { AppError } from '../../errors/AppError'
import type {
  Extraction,
  ExtractionStatus,
  ExtractedComponent,
  ExtractionFlag,
  ProjectTokenUsage
} from '@shared/types/entities'

interface ExtractionRow {
  id: string
  sld_id: string
  status: ExtractionStatus
  model: string | null
  raw_json: string | null
  error: string | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  completed_at: string | null
}

interface RawExtractionPayload {
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
}

export interface ExtractionUsage {
  inputTokens: number
  outputTokens: number
}

function toExtraction(row: ExtractionRow): Extraction {
  const parsed: RawExtractionPayload = row.raw_json
    ? JSON.parse(row.raw_json)
    : { components: [], flags: [] }
  return {
    id: row.id,
    sldId: row.sld_id,
    status: row.status,
    model: row.model,
    components: parsed.components,
    flags: parsed.flags,
    error: row.error,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    completedAt: row.completed_at
  }
}

export function createRunningExtraction(sldId: string): Extraction {
  const row: ExtractionRow = {
    id: randomUUID(),
    sld_id: sldId,
    status: 'running',
    model: null,
    raw_json: null,
    error: null,
    input_tokens: null,
    output_tokens: null,
    created_at: new Date().toISOString(),
    completed_at: null
  }

  getDb()
    .prepare(
      `INSERT INTO extractions
         (id, sld_id, status, model, raw_json, error, input_tokens, output_tokens, created_at, completed_at)
       VALUES
         (@id, @sld_id, @status, @model, @raw_json, @error, @input_tokens, @output_tokens, @created_at, @completed_at)`
    )
    .run(row)

  return toExtraction(row)
}

export function completeExtraction(
  id: string,
  model: string,
  payload: RawExtractionPayload,
  usage: ExtractionUsage | null
): void {
  getDb()
    .prepare(
      `UPDATE extractions
       SET status = 'done', model = ?, raw_json = ?, input_tokens = ?, output_tokens = ?, completed_at = ?
       WHERE id = ?`
    )
    .run(
      model,
      JSON.stringify(payload),
      usage?.inputTokens ?? null,
      usage?.outputTokens ?? null,
      new Date().toISOString(),
      id
    )
}

export function failExtraction(id: string, error: string, usage: ExtractionUsage | null): void {
  getDb()
    .prepare(
      `UPDATE extractions
       SET status = 'error', error = ?, input_tokens = ?, output_tokens = ?, completed_at = ?
       WHERE id = ?`
    )
    .run(error, usage?.inputTokens ?? null, usage?.outputTokens ?? null, new Date().toISOString(), id)
}

export function getLatestExtractionForSld(sldId: string): Extraction | null {
  const row = getDb()
    .prepare('SELECT * FROM extractions WHERE sld_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sldId) as ExtractionRow | undefined
  return row ? toExtraction(row) : null
}

// Domain rule: an SLD may only be extracted once successfully. Called before
// any API request is made so a locked SLD never spends tokens on a blocked
// attempt. A prior failed/running extraction does not lock — only 'done' does.
export function assertCanExtract(sldId: string, force: boolean): void {
  if (force) return
  const latest = getLatestExtractionForSld(sldId)
  if (latest?.status === 'done') {
    throw new AppError('AI_ALREADY_EXTRACTED')
  }
}

export function getProjectTokenUsage(projectId: string): ProjectTokenUsage {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(e.input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(e.output_tokens), 0) AS total_output_tokens,
         COUNT(*) AS extraction_count
       FROM extractions e
       JOIN slds s ON s.id = e.sld_id
       WHERE s.project_id = ? AND s.deleted_at IS NULL AND e.status IN ('done', 'error')`
    )
    .get(projectId) as {
    total_input_tokens: number
    total_output_tokens: number
    extraction_count: number
  }

  return {
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    extractionCount: row.extraction_count
  }
}
```

- [ ] **Step 5: Add the new fields to the shared `Extraction` type**

In `src/shared/types/entities.ts`, modify the `Extraction` interface (currently at line 338):

```ts
export interface Extraction {
  id: string
  sldId: string
  status: ExtractionStatus
  model: string | null
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
  error: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
  completedAt: string | null
}
```

Add a new exported type right after it:

```ts
export interface ProjectTokenUsage {
  totalInputTokens: number
  totalOutputTokens: number
  extractionCount: number
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:db`
Expected: PASS — all `extractionsRepo.dbtest.ts` cases green, `migrations.dbtest.ts` still green.

Run: `npm run typecheck`
Expected: PASS (this will surface any other call site still using the old `completeExtraction`/`failExtraction` arity — expected, fixed in Task 5).

- [ ] **Step 7: Commit**

```bash
git add src/main/db/repositories/extractionsRepo.ts src/main/db/repositories/extractionsRepo.dbtest.ts src/shared/errors/errorCodes.ts src/shared/types/entities.ts
git commit -m "feat: persist extraction token usage, add project totals and rerun lock"
```

---

### Task 3: Capture token usage from the Anthropic response

**Files:**
- Modify: `src/main/ai/AIProvider.ts`
- Modify: `src/main/ai/ClaudeProvider.ts`

**Interfaces:**
- Consumes: nothing new (Anthropic SDK's `Message.usage.input_tokens` / `Message.usage.output_tokens`, already present on the `message` object `ClaudeProvider.extractComponents` gets from `stream.finalMessage()`).
- Produces (consumed by Task 5 — `ai.ipc.ts`): `ExtractionResult.usage: { inputTokens: number; outputTokens: number }`.

- [ ] **Step 1: Add `usage` to the `ExtractionResult` interface**

In `src/main/ai/AIProvider.ts`, modify `ExtractionResult`:

```ts
export interface ExtractionResult {
  model: string
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
  usage: {
    inputTokens: number
    outputTokens: number
  }
}
```

- [ ] **Step 2: Populate it in `ClaudeProvider`**

In `src/main/ai/ClaudeProvider.ts`, the final `return` statement (currently `return { model: this.model, components, flags }`) becomes:

```ts
    return {
      model: this.model,
      components,
      flags,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      }
    }
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: FAIL at this point — `ai.ipc.ts`'s use of `ExtractionResult` doesn't yet read `usage` and `extractionsRepo`'s `completeExtraction`/`failExtraction` calls in `ai.ipc.ts` are still on the old arity from before Task 2 landed. This is expected; Task 5 fixes `ai.ipc.ts`. Confirm the *only* type errors reported are inside `src/main/ipc/ai.ipc.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/AIProvider.ts src/main/ai/ClaudeProvider.ts
git commit -m "feat: capture token usage from Claude extraction responses"
```

---

### Task 4: Shared IPC contract and preload plumbing

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `ProjectTokenUsage` type (Task 2), `Extraction` type (Task 2).
- Produces (consumed by Task 5 — `ai.ipc.ts` registers the handler; Task 6 — renderer hooks call these):
  - `IPC.aiGetProjectTokenUsage: 'ai:getProjectTokenUsage'`
  - `window.api.ai.extractSld(sldId: string, options?: { force?: boolean }): Promise<Extraction>` (signature change — was single-arg)
  - `window.api.ai.getProjectTokenUsage(projectId: string): Promise<ProjectTokenUsage>`

- [ ] **Step 1: Add the new IPC channel name**

In `src/shared/types/ipc-contract.ts`, add after `aiGetExtraction`:

```ts
  aiGetProjectTokenUsage: 'ai:getProjectTokenUsage',
```

- [ ] **Step 2: Update the preload API surface**

In `src/preload/index.ts`, add `ProjectTokenUsage` to the type import list from `'../shared/types/entities'` (alongside the existing `Extraction` import, keeping the list alphabetical as the rest of the file does), then replace the `ai` block:

```ts
  ai: {
    extractSld: (sldId: string, options?: { force?: boolean }): Promise<Extraction> =>
      ipcRenderer.invoke(IPC.aiExtractSld, sldId, options),
    getExtraction: (sldId: string): Promise<Extraction | null> =>
      ipcRenderer.invoke(IPC.aiGetExtraction, sldId),
    getProjectTokenUsage: (projectId: string): Promise<ProjectTokenUsage> =>
      ipcRenderer.invoke(IPC.aiGetProjectTokenUsage, projectId),
    onProgress: (callback: (progress: ExtractionProgressEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: ExtractionProgressEvent): void =>
        callback(payload)
      ipcRenderer.on(IPC.aiExtractionProgress, listener)
      return () => ipcRenderer.removeListener(IPC.aiExtractionProgress, listener)
    }
  },
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: Same `ai.ipc.ts`-only failures as Task 3 (still not yet fixed) — no *new* failures introduced by this task.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/preload/index.ts
git commit -m "feat: add project token usage IPC channel and force-reextract param"
```

---

### Task 5: Wire the IPC handler — accumulate usage, enforce the lock

**Files:**
- Modify: `src/main/ipc/ai.ipc.ts`

**Interfaces:**
- Consumes: `assertCanExtract`, `getProjectTokenUsage`, `ExtractionUsage` (Task 2); `completeExtraction`/`failExtraction` new signatures (Task 2); `ExtractionResult.usage` (Task 3); `IPC.aiGetProjectTokenUsage` (Task 4).
- Produces: nothing new consumed by later tasks — this is the integration point.

- [ ] **Step 1: Replace `registerAiIpc`**

Replace the full contents of `src/main/ipc/ai.ipc.ts`:

```ts
import { getSldById } from '../db/repositories/sldsRepo'
import {
  assertCanExtract,
  completeExtraction,
  createRunningExtraction,
  failExtraction,
  getLatestExtractionForSld,
  getProjectTokenUsage,
  type ExtractionUsage
} from '../db/repositories/extractionsRepo'
import { readSldFile } from '../storage/sldStorage'
import { listDistinctDescriptions } from '../db/repositories/catalogRepo'
import { ClaudeProvider } from '../ai/ClaudeProvider'
import type { AIProvider, ExtractionResult } from '../ai/AIProvider'
import { getSettings } from '../settings/settingsStore'
import { getAnthropicApiKey } from '../settings/secretsStore'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { Extraction, ProjectTokenUsage } from '@shared/types/entities'

let provider: AIProvider | null = null
let providerCacheKey: string | null = null

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

function addUsage(a: ExtractionUsage, b: ExtractionUsage): ExtractionUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }
}

export function registerAiIpc(): void {
  safeHandle(
    IPC.aiExtractSld,
    async (event, sldId: string, options?: { force?: boolean }): Promise<Extraction> => {
      const sld = getSldById(sldId)
      if (!sld) throw new AppError('DB_SLD_NOT_FOUND')

      assertCanExtract(sldId, options?.force ?? false)

      const extraction = createRunningExtraction(sldId)
      let accumulatedUsage: ExtractionUsage = { inputTokens: 0, outputTokens: 0 }

      try {
        const pdfBytes = readSldFile(sld.filePath)
        const { enabledComponentTypes, maxExtractionRetries, preferredBrands, customExtractionRules } =
          getSettings()
        const catalogDescriptions = listDistinctDescriptions(preferredBrands)

        const provider = getProvider()

        let result: ExtractionResult | undefined
        let lastError: Error | undefined
        for (let attempt = 0; attempt <= maxExtractionRetries; attempt++) {
          try {
            result = await provider.extractComponents({
              pdfBytes,
              filename: sld.filename,
              enabledComponentTypes,
              catalogDescriptions,
              preferredBrands,
              customRules: customExtractionRules,
              onProgress: (progress) => {
                event.sender.send(IPC.aiExtractionProgress, { sldId, ...progress })
              }
            })
            accumulatedUsage = addUsage(accumulatedUsage, result.usage)
            break
          } catch (err) {
            lastError = err as Error
            if (attempt < maxExtractionRetries) {
              event.sender.send(IPC.aiExtractionProgress, {
                sldId,
                pct: 0,
                stage: `Retrying (attempt ${attempt + 2}/${maxExtractionRetries + 1})`
              })
            }
          }
        }
        if (!result) throw lastError ?? new AppError('AI_REQUEST_FAILED')

        completeExtraction(
          extraction.id,
          result.model,
          { components: result.components, flags: result.flags },
          accumulatedUsage
        )

        return {
          ...extraction,
          status: 'done',
          model: result.model,
          components: result.components,
          flags: result.flags,
          inputTokens: accumulatedUsage.inputTokens,
          outputTokens: accumulatedUsage.outputTokens,
          completedAt: new Date().toISOString()
        }
      } catch (err) {
        // extraction.error is rendered directly to the user in ExtractionPanel,
        // so it must already be sanitized here — don't rely on safeHandle's
        // outer catch for that, it only sanitizes the IPC rejection. Log the
        // original error ourselves since converting it here means safeHandle
        // never sees the real cause.
        if (!(err instanceof AppError)) {
          console.error(`[ipc:${IPC.aiExtractSld}]`, err)
        }
        const appError = err instanceof AppError ? err : new AppError('AI_REQUEST_FAILED')
        const usageToPersist =
          accumulatedUsage.inputTokens === 0 && accumulatedUsage.outputTokens === 0
            ? null
            : accumulatedUsage
        failExtraction(extraction.id, appError.message, usageToPersist)
        event.sender.send(IPC.aiExtractionProgress, { sldId, pct: 0, stage: 'Failed' })
        throw appError
      }
    }
  )

  safeHandle(IPC.aiGetExtraction, (_event, sldId: string) => getLatestExtractionForSld(sldId))

  safeHandle(
    IPC.aiGetProjectTokenUsage,
    (_event, projectId: string): ProjectTokenUsage => getProjectTokenUsage(projectId)
  )
}
```

Note: `assertCanExtract` is called *before* `createRunningExtraction`, so a blocked re-extraction attempt never creates a spurious `running` row and never spends a token.

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS — this was the last remaining call site using the old signatures.

- [ ] **Step 3: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/ai.ipc.ts
git commit -m "feat: enforce once-per-SLD extraction lock and persist accumulated token usage"
```

---

### Task 6: Renderer data layer — extraction mutation options, project usage hook

**Files:**
- Modify: `src/renderer/src/state/queries/useExtraction.ts`
- Create: `src/renderer/src/state/queries/useAiUsage.ts`

**Interfaces:**
- Consumes: `window.api.ai.extractSld(sldId, options?)`, `window.api.ai.getProjectTokenUsage(projectId)` (Task 4); `ProjectTokenUsage` type (Task 2).
- Produces (consumed by Task 7 — `ExtractionPanel.tsx`, `TopBar.tsx`):
  - `useExtractSld(): UseMutationResult<Extraction, Error, { sldId: string; force?: boolean }>` (input type change — was `string`)
  - `useProjectTokenUsage(projectId: string | null): UseQueryResult<ProjectTokenUsage>`

- [ ] **Step 1: Update `useExtractSld`'s mutation input**

Replace `src/renderer/src/state/queries/useExtraction.ts`:

```ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Extraction } from '@shared/types/entities'

const extractionQueryKey = (sldId: string): readonly [string, string] => ['extraction', sldId]

export function useExtraction(sldId: string | null): UseQueryResult<Extraction | null> {
  return useQuery({
    queryKey: extractionQueryKey(sldId ?? ''),
    queryFn: () => window.api.ai.getExtraction(sldId as string),
    enabled: sldId !== null
  })
}

export interface ExtractSldInput {
  sldId: string
  force?: boolean
}

export function useExtractSld(): UseMutationResult<Extraction, Error, ExtractSldInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sldId, force }: ExtractSldInput) => window.api.ai.extractSld(sldId, { force }),
    onSuccess: (extraction) => {
      queryClient.setQueryData(extractionQueryKey(extraction.sldId), extraction)
    },
    // The main process persists a failed extraction row before rethrowing —
    // refetch so the panel picks up the error state instead of staying blank.
    onError: (_error, { sldId }) => {
      queryClient.invalidateQueries({ queryKey: extractionQueryKey(sldId) })
    }
  })
}
```

- [ ] **Step 2: Add the project token usage query hook**

Create `src/renderer/src/state/queries/useAiUsage.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ProjectTokenUsage } from '@shared/types/entities'

export function useProjectTokenUsage(projectId: string | null): UseQueryResult<ProjectTokenUsage> {
  return useQuery({
    queryKey: ['ai-token-usage', projectId ?? ''],
    queryFn: () => window.api.ai.getProjectTokenUsage(projectId as string),
    enabled: projectId !== null
  })
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `ExtractionPanel.tsx` still calls `extractSld.mutate(sldId)` with the old (now-wrong) argument shape. Confirm the only failure is in `ExtractionPanel.tsx`; fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/state/queries/useExtraction.ts src/renderer/src/state/queries/useAiUsage.ts
git commit -m "feat: add project token usage query hook, update extraction mutation input"
```

---

### Task 7: UI — token display and re-extract confirmation

**Files:**
- Modify: `src/renderer/src/components/pdf/ExtractionPanel.tsx`
- Modify: `src/renderer/src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `useExtractSld()` returning `UseMutationResult<Extraction, Error, ExtractSldInput>` (Task 6); `useProjectTokenUsage(projectId)` (Task 6); `Extraction.inputTokens`/`outputTokens` (Task 2).

- [ ] **Step 1: Update `ExtractionPanel.tsx`**

In `src/renderer/src/components/pdf/ExtractionPanel.tsx`, replace `handleGenerate` and the header block:

```tsx
  const alreadyExtracted = extraction?.status === 'done'

  const handleGenerate = (): void => {
    if (alreadyExtracted) {
      const confirmed = window.confirm(
        'This SLD was already extracted. Re-running will call the AI again and use additional tokens. Continue?'
      )
      if (!confirmed) return
      extractSld.mutate({ sldId, force: true })
      return
    }
    extractSld.mutate({ sldId })
  }
```

Update the header `<div>` block to show token counts and rename the button:

```tsx
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          AI extraction
          {extraction && extraction.status === 'done' && (
            <>
              <Badge tone="success">{extraction.components.length} components</Badge>
              {extraction.inputTokens !== null && extraction.outputTokens !== null && (
                <Badge tone="neutral">
                  {formatTokenCount(extraction.inputTokens)} in / {formatTokenCount(extraction.outputTokens)} out
                </Badge>
              )}
            </>
          )}
          {extraction?.status === 'error' && <Badge tone="danger">Failed</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={running}>
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {alreadyExtracted ? 'Re-extract…' : extraction ? 'Re-run' : 'Generate'}
        </Button>
      </div>
```

Add this helper at the bottom of the file, below the component:

```tsx
function formatTokenCount(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}K`
}
```

- [ ] **Step 2: Update `TopBar.tsx` with a project token usage badge**

In `src/renderer/src/components/layout/TopBar.tsx`, add the import:

```tsx
import { useProjectTokenUsage } from '@renderer/state/queries/useAiUsage'
```

Add a new component near `CurrencyField` (after its closing brace):

```tsx
function TokenUsageBadge({ projectId }: { projectId: string }): React.JSX.Element | null {
  const { data: usage } = useProjectTokenUsage(projectId)
  if (!usage || usage.extractionCount === 0) return null

  const total = usage.totalInputTokens + usage.totalOutputTokens
  const label = total < 1000 ? String(total) : `${(total / 1000).toFixed(1)}K`

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary"
      title={`${usage.totalInputTokens.toLocaleString()} input / ${usage.totalOutputTokens.toLocaleString()} output tokens across ${usage.extractionCount} extraction(s)`}
    >
      {label} tokens
    </span>
  )
}
```

In the `TopBar` function body, render it next to `CurrencyField`:

```tsx
      {project && <CurrencyField project={project} compact={compact} />}
      {project && <TokenUsageBadge projectId={project.id} />}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/pdf/ExtractionPanel.tsx src/renderer/src/components/layout/TopBar.tsx
git commit -m "feat: show token usage in extraction panel and top bar, confirm before re-extracting"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build and launch**

Run: `npm run dev` (kill any existing dev instance first — main-process changes in this plan require a restart, per this project's known electron-vite watcher limitation).

- [ ] **Step 2: Verify token display**

In the throwaway `ZZ Stage3 Test Project` (never touch `substartion-One`), run a fresh extraction on an SLD that has not been extracted before (or use one you're prepared to see re-locked). Confirm:
- The extraction completes and `ExtractionPanel` shows an `in / out` token badge with non-zero values.
- `TopBar` shows a token badge next to the currency field, and its tooltip breaks down input/output/extraction count.

- [ ] **Step 3: Verify the rerun lock**

Click the extraction button again on the same SLD. Confirm:
- The button now reads "Re-extract…".
- Clicking it shows the native confirm dialog warning about additional token usage.
- Cancelling makes no API call (no progress bar activity, token badge unchanged).
- Confirming makes a new API call, and the token badges update to reflect the additional usage.

- [ ] **Step 4: Verify a failed extraction does not lock**

Temporarily set an invalid API key (or trigger any other failure path available, e.g. via Settings), run extraction on an SLD with no prior successful extraction, confirm it fails with an error and the button still reads "Generate"/"Re-run" (not "Re-extract…", no confirmation required) once a valid key is restored and the SLD is retried.

- [ ] **Step 5: Final check**

Run: `npm run test:all` and `npm run typecheck` one more time to confirm nothing regressed from manual testing (e.g. no leftover debug code).
