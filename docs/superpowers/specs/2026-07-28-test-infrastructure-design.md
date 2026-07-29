# Test Infrastructure — Design

## Context

eQoutation currently has zero automated tests. Verification has been manual: `npm run typecheck`, `npm run build`, and clicking through the running app. This was directly implicated in a real bug found 2026-07-28 — `replaceCatalogItems` did a delete-all-and-reinsert on every catalog reload, which threw a `FOREIGN KEY constraint failed` as soon as any quotation had a matched line. Nothing caught this except manual clicking.

This is step 0 of a 6-step roadmap to finish the app's remaining stage gaps (see project memory `project-remaining-stages-roadmap`). Every later step in that roadmap is required to pass automated verification before proceeding, so a real test framework has to exist first.

## Goals

- Stand up Vitest as the test runner, integrated with the existing `electron-vite`/TypeScript toolchain.
- Cover the main-process business logic layer first — repositories, catalog matching, currency conversion, error parsing — since that's where real risk (data integrity, money math) lives, and it's exactly where today's bug lived.
- Write a regression test that would have caught today's catalog-reload bug.
- Leave renderer component tests and full end-to-end tests as later, separate steps (out of scope here).

## Non-goals

- No CI pipeline in this step (none exists in this repo yet).
- No renderer/React component tests in this step.
- No end-to-end (full app) test automation in this step.

## Design

### Runtime split (the ABI problem)

`better-sqlite3` is a native module compiled against Electron's bundled Node/V8 ABI. It fails to load under the system's plain Node (confirmed directly today — `ERR_DLOPEN_FAILED`, NODE_MODULE_VERSION mismatch). Any test that touches a real repository (which opens a real `better-sqlite3` connection) must run inside a Node runtime with matching ABI.

Two Vitest configs, sharing test syntax/assertions but different execution environments:

- **`vitest.config.ts`** (default, `npm run test`) — runs under plain system Node. For logic with zero DB/Electron dependency: `currencyConversion.ts`, `catalogMatcher.ts`, `parseErrorMessage.ts`, `preferredBrandResolver.ts`, error-code formatting helpers.
- **`vitest.electron.config.ts`** (`npm run test:db`) — the same Vitest CLI, invoked via `electron` itself with `ELECTRON_RUN_AS_NODE=1`, so `require('better-sqlite3')` resolves against the correct ABI. Tests here open a real **`:memory:`** SQLite DB (never the user's real `eqoutation.sqlite`), run the actual migration runner against it, and exercise repository functions for real.

`cross-env` is added as a devDependency purely so setting `ELECTRON_RUN_AS_NODE=1` works identically in PowerShell and any other shell — no other purpose.

### Conventions

- Test files are colocated: `foo.ts` → `foo.test.ts` in the same directory. Standard Vitest default, no separate mirrored `tests/` tree to keep in sync.
- `package.json` scripts:
  - `"test"` — plain-Node suite (fast, no Electron launch).
  - `"test:db"` — Electron-runtime suite.
  - `"test:all"` — both, in sequence. This is the command every later roadmap step's "automated verification" gate runs.

### Initial test coverage

**Plain-Node (`vitest.config.ts`):**
- `currencyConversion.test.ts` — `convertFromBase`/`convertToBase` round-trip correctness (the exact math verified live during today's code-review fixes), rounding edge cases.
- `catalogMatcher.test.ts` — Jaccard similarity scoring, matched vs. unknown threshold behavior, preferred-brand tie-breaking.
- `parseErrorMessage.test.ts` — extracts known AppError codes correctly; does NOT misparse a foreign error string containing an "Error XX-###:"-shaped substring that isn't a real known code (regression test for today's code-review fix).
- `preferredBrandResolver.test.ts` — per-type override wins over the global preferred-brands list; falls back correctly when unset.

**Electron-runtime (`vitest.electron.config.ts`):**
- `migrations.test.ts` — all 18 migrations apply cleanly in order to a fresh `:memory:` DB with no errors.
- `catalogRepo.test.ts` — **regression test for today's bug**: seed a catalog item, create a quotation_line referencing it via `catalog_item_id`, call `replaceCatalogItems` with a new item set that no longer includes that SKU, and assert (a) no `FOREIGN KEY constraint failed` is thrown, (b) the still-referenced row is preserved rather than deleted, (c) a genuinely stale and unreferenced row IS removed, (d) an existing SKU's fields update in place with its `id` unchanged (proving FK-safety of the upsert path).

## Verification

- `npm run test:all` exits 0 with all of the above passing.
- Manual: run `npm run test:all` in the terminal and visually confirm the reported pass count matches the number of test files/cases written (no silently-skipped suites).
