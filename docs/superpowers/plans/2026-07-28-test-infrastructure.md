# Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Vitest as eQoutation's test runner, split into a plain-Node config (pure business logic) and an Electron-runtime config (real `better-sqlite3` repository tests), and write the first real coverage — including a regression test for the catalog-reload FOREIGN KEY bug fixed 2026-07-28.

**Architecture:** Two Vitest configs sharing the same test syntax. `vitest.config.ts` runs on plain system Node for logic with zero DB/Electron dependency. `vitest.electron.config.ts` runs the same Vitest CLI via `ELECTRON_RUN_AS_NODE=1 electron ...` so `better-sqlite3`'s native binary (compiled against Electron's ABI) loads correctly, exercising real repository code against a real `:memory:` SQLite DB — never the user's actual `eqoutation.sqlite`.

**Tech Stack:** Vitest, cross-env (Windows-safe env var setting in npm scripts), the existing `better-sqlite3` + hand-rolled migration runner already in `src/main/db/`.

## Global Constraints

- Test files are colocated: `foo.ts` → `foo.test.ts` (plain-Node) or `foo.dbtest.ts` (Electron-runtime) in the same directory. Never a separate mirrored `tests/` tree.
- DB tests must NEVER touch the real `eqoutation.sqlite` at `app.getPath('userData')` — always `:memory:` via the `EQOUTATION_DB_PATH` env var override.
- No CI pipeline in this plan — none exists in this repo yet, out of scope.
- No renderer/React component tests and no end-to-end tests in this plan — separate future steps.
- `npm run test:all` is the single command every later roadmap step's automated-verification gate will run — it must exit 0 only when every suite genuinely passes.

---

### Task 1: Plain-Node Vitest setup + first passing test (currencyConversion)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/shared/lib/currencyConversion.test.ts`
- Modify: `package.json` (add `devDependencies.vitest`, add `"test"` and `"test:watch"` scripts)

**Interfaces:**
- Consumes: `convertFromBase(amountInMyr: number, exchangeRate: number): number` and `convertToBase(amountInDisplayCurrency: number, exchangeRate: number): number`, both already exported from `src/shared/lib/currencyConversion.ts`.
- Produces: a working `npm run test` command and `vitest.config.ts` that later tasks (2, 3, 4) add test files under, unchanged.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 4: Write the failing test**

Create `src/shared/lib/currencyConversion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { convertFromBase, convertToBase } from './currencyConversion'

describe('convertFromBase', () => {
  it('is the identity when rate is 1 (base currency, MYR)', () => {
    expect(convertFromBase(105.54, 1)).toBe(105.54)
  })

  it('converts MYR to a display currency and rounds to 2dp', () => {
    // Verified live 2026-07-28: a catalog item costing 40.85 MYR displayed
    // as $10.00 when the project's exchange rate was 0.24477 (USD).
    expect(convertFromBase(40.85, 0.24477)).toBe(10)
  })

  it('returns 0 for a 0 amount regardless of rate', () => {
    expect(convertFromBase(0, 0.24477)).toBe(0)
  })
})

describe('convertToBase', () => {
  it('is the identity when rate is 1 (base currency, MYR)', () => {
    expect(convertToBase(105.54, 1)).toBe(105.54)
  })

  it('converts a display-currency amount back to MYR and rounds to 2dp', () => {
    // Verified live 2026-07-28: typing 10 (USD) into the add-to-catalog form
    // stored 40.85 MYR, which round-tripped back to exactly $10.00.
    expect(convertToBase(10, 0.24477)).toBe(40.85)
  })
})
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm run test`
Expected: `5 passed` (or similar), exit code 0. If Vitest isn't found, re-check Step 1 completed (`node_modules/.bin/vitest` should exist).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/shared/lib/currencyConversion.test.ts package.json package-lock.json
git commit -m "test: add Vitest plain-Node setup with currencyConversion coverage"
```

---

### Task 2: parseErrorMessage tests (regression test for today's known-code fix)

**Files:**
- Create: `src/shared/errors/parseErrorMessage.test.ts`

**Interfaces:**
- Consumes: `parseErrorMessage(message: string): ParsedError` where `ParsedError = { code: string | null; explanation: string }`, exported from `src/shared/errors/parseErrorMessage.ts`. Also consumes real codes from `src/shared/errors/errorCodes.ts` (e.g. `AI_NO_API_KEY: { code: 'AI-001', message: 'Anthropic API key not set' }`).
- Produces: nothing consumed by later tasks — this is a leaf test file.

- [ ] **Step 1: Write the failing test**

Create `src/shared/errors/parseErrorMessage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseErrorMessage } from './parseErrorMessage'

describe('parseErrorMessage', () => {
  it('extracts a known AppError code and explanation', () => {
    const result = parseErrorMessage('Error AI-001: Anthropic API key not set')
    expect(result).toEqual({ code: 'AI-001', explanation: 'Anthropic API key not set' })
  })

  it('finds the marker even when Electron wraps it with IPC boilerplate', () => {
    const wrapped =
      "Error invoking remote method 'ai:extractSld': AppError: Error AI-001: Anthropic API key not set"
    const result = parseErrorMessage(wrapped)
    expect(result).toEqual({ code: 'AI-001', explanation: 'Anthropic API key not set' })
  })

  it('does not treat an unknown code-shaped substring as a real AppError code', () => {
    const foreign = 'NetworkError: upstream said Error XX-999: not one of ours'
    const result = parseErrorMessage(foreign)
    expect(result).toEqual({ code: null, explanation: foreign })
  })

  it('falls back to the whole message when there is no code marker at all', () => {
    const plain = 'Please enter a SKU before submitting.'
    const result = parseErrorMessage(plain)
    expect(result).toEqual({ code: null, explanation: plain })
  })
})
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `npm run test`
Expected: all previous tests plus these 4 new ones pass, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/errors/parseErrorMessage.test.ts
git commit -m "test: add parseErrorMessage coverage, including known-code guard regression"
```

---

### Task 3: catalogMatcher tests

**Files:**
- Create: `src/main/quotation/catalogMatcher.test.ts`

**Interfaces:**
- Consumes: `matchComponent(component: ExtractedComponent, catalogItems: CatalogItem[], preferredBrands?: string[]): MatchResult` where `MatchResult = { catalogItem: CatalogItem | null; confidence: number }`, exported from `src/main/quotation/catalogMatcher.ts`. Types `CatalogItem` and `ExtractedComponent` from `@shared/types/entities`.
- Produces: nothing consumed by later tasks — leaf test file.

- [ ] **Step 1: Write the failing test**

Create `src/main/quotation/catalogMatcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchComponent } from './catalogMatcher'
import type { CatalogItem, ExtractedComponent } from '@shared/types/entities'

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'item-1',
    sku: 'SKU-1',
    description: 'generic item',
    maker: 'GENERIC',
    family: '',
    series: '',
    listPrice: 100,
    discountFactor: 1,
    unitPrice: 100,
    uom: 'PC',
    sourceRow: 1,
    updatedAt: new Date().toISOString(),
    ...overrides
  }
}

function extractedComponent(overrides: Partial<ExtractedComponent> = {}): ExtractedComponent {
  return {
    description: 'generic component',
    qty: 1,
    uom: 'PC',
    tag: '',
    pageNumber: 1,
    panelName: 'MDB',
    componentType: 'MCB',
    confidence: 0.9,
    notes: '',
    ...overrides
  }
}

describe('matchComponent', () => {
  it('matches exactly by tag/SKU regardless of description, with full confidence', () => {
    const item = catalogItem({ id: 'exact', sku: 'A9N61500' })
    const component = extractedComponent({
      tag: 'a9n61500',
      description: 'completely different text'
    })
    const result = matchComponent(component, [item])
    expect(result).toEqual({ catalogItem: item, confidence: 1 })
  })

  it('matches by normalized description overlap when no tag match exists', () => {
    const item = catalogItem({ id: 'overlap', description: '40A 3P 10kA MCCB' })
    const component = extractedComponent({ tag: '', description: '40A 3P 10kA MCCB' })
    const result = matchComponent(component, [item])
    expect(result.catalogItem).toEqual(item)
    expect(result.confidence).toBe(1)
  })

  it('leaves a component unmatched when no catalog item clears the threshold', () => {
    const item = catalogItem({ id: 'unrelated', description: 'CAPACITOR BANK 25kvar 525V' })
    const component = extractedComponent({ tag: '', description: 'DIGITAL POWER METER' })
    const result = matchComponent(component, [item])
    expect(result.catalogItem).toBeNull()
  })

  it('prefers a preferred-brand match over a higher-scoring non-preferred one, when it clears the threshold', () => {
    const preferred = catalogItem({
      id: 'pref',
      maker: 'ABB',
      description: '40A 3P 10kA MCCB, older style variant'
    })
    const other = catalogItem({ id: 'other', maker: 'SCHNEIDER', description: '40A 3P 10kA MCCB' })
    const component = extractedComponent({ tag: '', description: '40A 3P 10kA MCCB' })
    const result = matchComponent(component, [preferred, other], ['ABB'])
    expect(result.catalogItem?.id).toBe('pref')
  })

  it('falls back to the best match from any brand if the preferred brand has nothing above threshold', () => {
    const preferred = catalogItem({ id: 'pref', maker: 'ABB', description: 'totally unrelated text' })
    const other = catalogItem({ id: 'other', maker: 'SCHNEIDER', description: '40A 3P 10kA MCCB' })
    const component = extractedComponent({ tag: '', description: '40A 3P 10kA MCCB' })
    const result = matchComponent(component, [preferred, other], ['ABB'])
    expect(result.catalogItem?.id).toBe('other')
  })
})
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `npm run test`
Expected: all previous tests plus these 5 new ones pass, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/quotation/catalogMatcher.test.ts
git commit -m "test: add catalogMatcher coverage for tag/description matching and preferred brands"
```

---

### Task 4: preferredBrandResolver tests

**Files:**
- Create: `src/main/settings/preferredBrandResolver.test.ts`

**Interfaces:**
- Consumes: `resolveEffectivePreferredBrands(componentType: string, settings: Pick<AppSettings, 'preferredBrands' | 'preferredBrandsByType'>): string[]`, exported from `src/main/settings/preferredBrandResolver.ts`.
- Produces: nothing consumed by later tasks — leaf test file.

- [ ] **Step 1: Write the failing test**

Create `src/main/settings/preferredBrandResolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveEffectivePreferredBrands } from './preferredBrandResolver'

describe('resolveEffectivePreferredBrands', () => {
  it('returns the per-type override when one is set for this component type', () => {
    const result = resolveEffectivePreferredBrands('MCCB', {
      preferredBrands: ['SCHNEIDER'],
      preferredBrandsByType: { MCCB: 'ABB' }
    })
    expect(result).toEqual(['ABB'])
  })

  it('falls back to the global preferred-brands list when no per-type override exists', () => {
    const result = resolveEffectivePreferredBrands('Contactor', {
      preferredBrands: ['SCHNEIDER'],
      preferredBrandsByType: { MCCB: 'ABB' }
    })
    expect(result).toEqual(['SCHNEIDER'])
  })

  it('returns an empty list when nothing is configured', () => {
    const result = resolveEffectivePreferredBrands('MCCB', {
      preferredBrands: [],
      preferredBrandsByType: {}
    })
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `npm run test`
Expected: all previous tests plus these 3 new ones pass, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/settings/preferredBrandResolver.test.ts
git commit -m "test: add preferredBrandResolver coverage"
```

---

### Task 5: Electron-runtime Vitest pipeline (db/index.ts test hook + config + first passing test)

**Files:**
- Modify: `src/main/db/index.ts` (add `EQOUTATION_DB_PATH` override + exported `closeDb()`)
- Create: `vitest.electron.config.ts`
- Create: `src/main/db/migrations.dbtest.ts`
- Modify: `package.json` (add `cross-env` devDependency, add `"test:db"` script)

**Interfaces:**
- Consumes: `migrations: Migration[]` (`{ version: number; name: string; sql: string }[]`) exported from `src/main/db/migrations/index.ts`.
- Produces: `getDb(): Database.Database` (unchanged signature) and a new `closeDb(): void`, both exported from `src/main/db/index.ts` — Task 6's `catalogRepo.dbtest.ts` imports both. Also produces the `npm run test:db` command and `*.dbtest.ts` file convention that Task 6 writes into.

- [ ] **Step 1: Install cross-env**

Run: `npm install -D cross-env`

- [ ] **Step 2: Add the test-only DB override and closeDb() to db/index.ts**

In `src/main/db/index.ts`, replace the full file with:

```ts
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { migrations } from './migrations'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = openDb()
  }
  return db
}

// Test-only: closes and clears the cached connection so the next getDb()
// call opens a fresh one. Used between tests to get an isolated :memory: DB
// per test rather than sharing state across the whole test file.
export function closeDb(): void {
  db?.close()
  db = null
}

function openDb(): Database.Database {
  // EQOUTATION_DB_PATH lets tests point at an isolated (e.g. ':memory:')
  // database instead of the user's real eqoutation.sqlite. Only ever set by
  // test setup — never set in the packaged app.
  const dbPath = process.env.EQOUTATION_DB_PATH ?? join(app.getPath('userData'), 'eqoutation.sqlite')
  const instance = new Database(dbPath)
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  runMigrations(instance)
  return instance
}

function runMigrations(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedVersions = new Set(
    instance
      .prepare('SELECT version FROM schema_version')
      .all()
      .map((row) => (row as { version: number }).version)
  )

  const pending = migrations
    .filter((migration) => !appliedVersions.has(migration.version))
    .sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const apply = instance.transaction(() => {
      instance.exec(migration.sql)
      instance
        .prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })
    apply()
  }
}
```

- [ ] **Step 3: Create `vitest.electron.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['src/**/*.dbtest.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})
```

- [ ] **Step 4: Find the exact Vitest CLI entry path and add the `test:db` script**

Run: `cat node_modules/vitest/package.json | grep -A2 '"bin"'` (or open that file) to confirm the CLI entry file path (commonly `vitest.mjs` at the package root, but confirm against what actually got installed in Task 1).

In `package.json`, inside `"scripts"`, add (adjust the path after `electron` if Step 4's check found a different entry file):

```json
"test:db": "cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run --config vitest.electron.config.ts",
```

- [ ] **Step 5: Write the failing test**

Create `src/main/db/migrations.dbtest.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './index'
import { migrations } from './migrations'

beforeAll(() => {
  process.env.EQOUTATION_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
})

describe('migration runner', () => {
  it('applies every migration cleanly to a fresh in-memory database', () => {
    const db = getDb()
    const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all() as {
      version: number
    }[]
    const appliedVersions = rows.map((r) => r.version)
    const expectedVersions = [...migrations.map((m) => m.version)].sort((a, b) => a - b)
    expect(appliedVersions).toEqual(expectedVersions)
  })

  it('creates the catalog_items table with the columns replaceCatalogItems expects', () => {
    const db = getDb()
    const columns = db.prepare('PRAGMA table_info(catalog_items)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toEqual(
      expect.arrayContaining(['id', 'sku', 'description', 'list_price', 'unit_price'])
    )
  })
})
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npm run test:db`
Expected: `2 passed`, exit code 0. If it fails with a `better-sqlite3` load error (NODE_MODULE_VERSION mismatch), the `ELECTRON_RUN_AS_NODE` env var or the vitest CLI entry path from Step 4 is wrong — re-check both against the actually-installed `node_modules/vitest/package.json`.

- [ ] **Step 7: Confirm the real app still boots (db/index.ts touches production code)**

Run: `npm run build` then launch the packaged app once (`npm start`) and confirm it opens without error, then close it. This step only needs a visual confirmation the window opens — `EQOUTATION_DB_PATH` is unset in normal launches so `openDb()` falls back to the exact same `app.getPath('userData')` path as before.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/index.ts vitest.electron.config.ts src/main/db/migrations.dbtest.ts package.json package-lock.json
git commit -m "test: add Electron-runtime Vitest pipeline with migration-runner smoke test"
```

---

### Task 6: catalogRepo regression test for the reload FK bug

**Files:**
- Create: `src/main/db/repositories/catalogRepo.dbtest.ts`

**Interfaces:**
- Consumes: `getDb`, `closeDb` from `src/main/db/index.ts` (Task 5). Consumes `getAllCatalogItems(): CatalogItem[]`, `insertCatalogItem(input: CatalogItemInput): CatalogItem`, `replaceCatalogItems(items: CatalogItemInput[]): number` from `src/main/db/repositories/catalogRepo.ts`, where `CatalogItemInput = { sku: string; description: string; maker?: string; family?: string; series?: string; listPrice?: number; discountFactor?: number; unitPrice?: number; uom?: string; sourceRow?: number }`.
- Produces: nothing consumed by later tasks — leaf test file.

- [ ] **Step 1: Write the failing test**

Create `src/main/db/repositories/catalogRepo.dbtest.ts`:

```ts
import { randomUUID } from 'crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { getAllCatalogItems, insertCatalogItem, replaceCatalogItems } from './catalogRepo'

beforeAll(() => {
  process.env.EQOUTATION_DB_PATH = ':memory:'
})

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

// Minimal project -> sld -> quotation -> quotation_line chain so a
// quotation_line can legally reference a real quotation_id (NOT NULL FK),
// with catalog_item_id pointing at the given catalog item.
function createQuotationLineReferencing(catalogItemId: string): void {
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

  const quotationId = randomUUID()
  db.prepare(
    "INSERT INTO quotations (id, sld_id, code, created_at, updated_at) VALUES (?, ?, 'Q-TEST', ?, ?)"
  ).run(quotationId, sldId, now, now)

  db.prepare(
    `INSERT INTO quotation_lines
       (id, quotation_id, catalog_item_id, description, match_status, match_confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), quotationId, catalogItemId, 'Test Line', 'matched', 1, now)
}

describe('replaceCatalogItems', () => {
  it('does not throw and preserves the id of a still-referenced item, even if its SKU is dropped from the new source data', () => {
    const referenced = insertCatalogItem({ sku: 'KEEP-ME', description: 'Referenced item' })
    createQuotationLineReferencing(referenced.id)

    expect(() =>
      replaceCatalogItems([{ sku: 'SOME-OTHER-SKU', description: 'Unrelated' }])
    ).not.toThrow()

    const stillThere = getAllCatalogItems().find((i) => i.id === referenced.id)
    expect(stillThere).toBeDefined()
    expect(stillThere?.sku).toBe('KEEP-ME')
  })

  it('removes a stale item that nothing references', () => {
    insertCatalogItem({ sku: 'STALE-UNREFERENCED', description: 'No longer in source' })

    replaceCatalogItems([{ sku: 'FRESH-ITEM', description: 'From the latest reload' }])

    const items = getAllCatalogItems()
    expect(items.find((i) => i.sku === 'STALE-UNREFERENCED')).toBeUndefined()
    expect(items.find((i) => i.sku === 'FRESH-ITEM')).toBeDefined()
  })

  it('updates an existing SKU in place, keeping its id unchanged', () => {
    const original = insertCatalogItem({
      sku: 'SAME-SKU',
      description: 'Old description',
      unitPrice: 10
    })

    replaceCatalogItems([{ sku: 'SAME-SKU', description: 'New description', unitPrice: 20 }])

    const updated = getAllCatalogItems().find((i) => i.sku === 'SAME-SKU')
    expect(updated?.id).toBe(original.id)
    expect(updated?.description).toBe('New description')
    expect(updated?.unitPrice).toBe(20)
  })
})
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `npm run test:db`
Expected: all 2 tests from Task 5 plus these 3 new ones pass (5 total), exit code 0.

- [ ] **Step 3: Verify the test actually catches the bug it's meant to catch**

Temporarily revert `replaceCatalogItems` in `src/main/db/repositories/catalogRepo.ts` to the old delete-all-and-reinsert body (the version from before 2026-07-28's fix: `DELETE FROM catalog_items` then insert every row with `randomUUID()`, returning `items.length`), run `npm run test:db` again, and confirm the first test in this file now FAILS with a `FOREIGN KEY constraint failed` error. Then revert `catalogRepo.ts` back to the current upsert-by-SKU version (`git checkout -- src/main/db/repositories/catalogRepo.ts`) and run `npm run test:db` once more to confirm all 5 tests pass again.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/repositories/catalogRepo.dbtest.ts
git commit -m "test: add replaceCatalogItems regression test for the reload FK bug"
```

---

### Task 7: Wire test:all and final verification

**Files:**
- Modify: `package.json` (add `"test:all"` script)

**Interfaces:**
- Consumes: `"test"` (Task 1) and `"test:db"` (Task 5) npm scripts.
- Produces: `npm run test:all` — the command every later roadmap step (AI cost governance, AI annotations, multi-project switcher, per-project model override, packaging) uses as its automated-verification gate.

- [ ] **Step 1: Add the combined script**

In `package.json`, inside `"scripts"`, add:

```json
"test:all": "npm run test && npm run test:db",
```

- [ ] **Step 2: Run the full suite from a clean state**

Run: `npm run test:all`
Expected: both suites run in sequence, all tests pass (13 total across both configs: 5 currencyConversion + 4 parseErrorMessage + 5 catalogMatcher + 3 preferredBrandResolver = 17 plain-Node, plus 2 migrations + 3 catalogRepo = 5 Electron-runtime — 22 total), exit code 0.

- [ ] **Step 3: Confirm typecheck and lint still pass**

Run: `npm run typecheck` and `npx eslint src/**/*.test.ts src/**/*.dbtest.ts vitest.config.ts vitest.electron.config.ts`
Expected: both exit 0. Fix any type/lint errors surfaced in the new files before proceeding.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test: wire test:all as the combined automated-verification command"
```
