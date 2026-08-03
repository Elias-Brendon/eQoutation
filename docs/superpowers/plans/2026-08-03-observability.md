# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist errors and crashes to a structured `event_log` SQLite table and let the user export a local diagnostic bundle (event log + system info) — no automatic upload, ever.

**Architecture:** A new `event_log` table + `eventLogRepo.ts`, written to from two places: the existing `safeHandle.ts` IPC error-catching wrapper (for unexpected IPC errors) and a new `crashHandlers.ts` (for main-process `uncaughtException`/`unhandledRejection` and renderer `render-process-gone`/`unresponsive`). A new `diagnosticBundleExporter.ts` reads the table back out, adds a system-info snapshot, and writes a single JSON file via the existing `dialog.showSaveDialog` export pattern, surfaced through a new Settings > Diagnostics section mirroring `TrainingDataSection.tsx`.

**Tech Stack:** better-sqlite3 (existing DB), Vitest `dbtest` suite (existing pattern, real DB, no mocking — this codebase has no `vi.mock` usage anywhere and this plan doesn't introduce any), React Query mutation hooks (existing pattern).

## Global Constraints

- `event_log` only ever receives `level: 'error'` (unexpected IPC errors) or `level: 'crash'` (main/renderer crash events) rows — never successful action milestones. Source: spec "Out of scope."
- No automatic upload, network call, or telemetry of any kind — the diagnostic bundle is written only to a file the user explicitly picks via a save dialog. Source: spec "Privacy stance."
- No changes to the Settings > About disclosure text — a locally-stored, user-exported log doesn't contradict "nothing to the developer." Source: spec "Privacy stance."
- No retention/pruning policy for `event_log` in this plan. Source: spec, `event_log` table section.
- Crash handlers only observe and persist — they must not change Electron's existing default behavior (no custom crash screen, no forced restart/quit logic). Source: spec, "Crash reporting" section.
- The diagnostic bundle is a single JSON file, not a zip. Source: spec, "Diagnostic bundle export" section.

---

### Task 1: `event_log` table and repository

**Files:**
- Create: `src/main/db/migrations/0025_event_log.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/shared/types/entities.ts`
- Create: `src/main/db/repositories/eventLogRepo.ts`
- Test: `src/main/db/repositories/eventLogRepo.dbtest.ts`

**Interfaces:**
- Produces: `EventLogLevel = 'error' | 'crash'`, `EventLogEntry { id, level, source, message, errorCode: string | null, context: string | null, createdAt }` (in `src/shared/types/entities.ts`); `logEvent(entry: { level: EventLogLevel; source: string; message: string; errorCode?: string; context?: unknown }): void` and `listEvents(limit?: number): EventLogEntry[]` (in `src/main/db/repositories/eventLogRepo.ts`) — consumed by Task 2, Task 3, and Task 4.

- [ ] **Step 1: Write the migration**

`src/main/db/migrations/0025_event_log.ts`:

```typescript
export const sql = `
CREATE TABLE event_log (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('error', 'crash')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  error_code TEXT,
  context TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_event_log_created_at ON event_log(created_at);
`
```

- [ ] **Step 2: Register the migration**

In `src/main/db/migrations/index.ts`, add the import after `m0024`:

```typescript
import { sql as m0025 } from './0025_event_log'
```

And add the entry after `{ version: 24, ... }` in the `migrations` array:

```typescript
  { version: 25, name: '0025_event_log', sql: m0025 }
```

- [ ] **Step 3: Add the shared types**

In `src/shared/types/entities.ts`, after the existing `FeedbackLogEntry`/`FeedbackResolveLineInput` block (around line 338), add:

```typescript
export type EventLogLevel = 'error' | 'crash'

export interface EventLogEntry {
  id: string
  level: EventLogLevel
  source: string
  message: string
  errorCode: string | null
  context: string | null
  createdAt: string
}
```

- [ ] **Step 4: Write the failing test**

`src/main/db/repositories/eventLogRepo.dbtest.ts`:

```typescript
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { logEvent, listEvents } from './eventLogRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('logEvent / listEvents', () => {
  it('persists an error-level event and reads it back', () => {
    logEvent({ level: 'error', source: 'ipc:test:channel', message: 'boom' })

    const events = listEvents()
    expect(events).toHaveLength(1)
    expect(events[0].level).toBe('error')
    expect(events[0].source).toBe('ipc:test:channel')
    expect(events[0].message).toBe('boom')
    expect(events[0].errorCode).toBeNull()
    expect(events[0].context).toBeNull()
  })

  it('serializes context to a JSON string', () => {
    logEvent({
      level: 'crash',
      source: 'main:uncaughtException',
      message: 'crashed',
      context: { stack: 'at foo()' }
    })

    const [event] = listEvents()
    expect(event.context).toBe(JSON.stringify({ stack: 'at foo()' }))
  })

  it('orders by most recent first and respects the limit', () => {
    getDb()
      .prepare(
        `INSERT INTO event_log (id, level, source, message, error_code, context, created_at)
         VALUES ('e1', 'error', 'src1', 'first', NULL, NULL, '2026-01-01T00:00:00.000Z'),
                ('e2', 'error', 'src2', 'second', NULL, NULL, '2026-01-02T00:00:00.000Z'),
                ('e3', 'error', 'src3', 'third', NULL, NULL, '2026-01-03T00:00:00.000Z')`
      )
      .run()

    const events = listEvents(2)
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.id)).toEqual(['e3', 'e2'])
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `Cannot find module './eventLogRepo'` (the file doesn't exist yet).

- [ ] **Step 6: Implement the repository**

`src/main/db/repositories/eventLogRepo.ts`:

```typescript
import { randomUUID } from 'crypto'
import { getDb } from '../index'
import type { EventLogEntry, EventLogLevel } from '@shared/types/entities'

interface EventLogRow {
  id: string
  level: EventLogLevel
  source: string
  message: string
  error_code: string | null
  context: string | null
  created_at: string
}

function toEventLogEntry(row: EventLogRow): EventLogEntry {
  return {
    id: row.id,
    level: row.level,
    source: row.source,
    message: row.message,
    errorCode: row.error_code,
    context: row.context,
    createdAt: row.created_at
  }
}

export interface LogEventInput {
  level: EventLogLevel
  source: string
  message: string
  errorCode?: string
  context?: unknown
}

export function logEvent(input: LogEventInput): void {
  const row: EventLogRow = {
    id: randomUUID(),
    level: input.level,
    source: input.source,
    message: input.message,
    error_code: input.errorCode ?? null,
    context: input.context !== undefined ? JSON.stringify(input.context) : null,
    created_at: new Date().toISOString()
  }

  getDb()
    .prepare(
      `INSERT INTO event_log (id, level, source, message, error_code, context, created_at)
       VALUES (@id, @level, @source, @message, @error_code, @context, @created_at)`
    )
    .run(row)
}

export function listEvents(limit = 500): EventLogEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT ?')
    .all(limit) as EventLogRow[]
  return rows.map(toEventLogEntry)
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS (3 new tests).

- [ ] **Step 8: Commit**

```bash
git add src/main/db/migrations/0025_event_log.ts src/main/db/migrations/index.ts src/shared/types/entities.ts src/main/db/repositories/eventLogRepo.ts src/main/db/repositories/eventLogRepo.dbtest.ts
git commit -m "feat: add event_log table and repository for observability"
```

---

### Task 2: Log unexpected IPC errors

**Files:**
- Modify: `src/main/ipc/safeHandle.ts`

**Interfaces:**
- Consumes: `logEvent` from Task 1 (`src/main/db/repositories/eventLogRepo.ts`).

- [ ] **Step 1: Add the logging call**

In `src/main/ipc/safeHandle.ts`, the existing catch branch is:

```typescript
    } catch (error) {
      if (error instanceof AppError) throw error
      console.error(`[ipc:${channel}]`, error)
      throw new AppError('GEN_UNEXPECTED')
    }
```

Change it to (add the import at the top of the file too):

```typescript
import { logEvent } from '../db/repositories/eventLogRepo'
```

```typescript
    } catch (error) {
      if (error instanceof AppError) throw error
      console.error(`[ipc:${channel}]`, error)
      logEvent({
        level: 'error',
        source: `ipc:${channel}`,
        message: error instanceof Error ? error.message : String(error),
        context: error instanceof Error ? { stack: error.stack } : undefined
      })
      throw new AppError('GEN_UNEXPECTED')
    }
```

`AppError` instances are unaffected — they're rethrown before this new code runs, matching the existing "expected, user-facing failure, not a bug" distinction the file's own comment already documents. Only genuinely unexpected errors (raw db/fs/network exceptions, library errors, bugs) get logged.

- [ ] **Step 2: Verify no regressions**

Run: `npm run test:all`
Expected: all existing tests (21 Node + the dbtest suite from Task 1) still PASS — this change doesn't touch any code path the existing suites exercise directly, so this is a regression check, not new coverage. (This codebase has no tests for `ipc/*.ts` files — see `src/main/ipc/`, none exist — so there is no dedicated automated test for this specific wiring; it's verified live in Task 4's final step instead, alongside the rest of the observability feature.)

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/safeHandle.ts
git commit -m "feat: log unexpected IPC errors to event_log"
```

---

### Task 3: Crash handlers (main + renderer)

**Files:**
- Create: `src/main/observability/crashHandlers.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/observability/crashHandlers.dbtest.ts`

**Interfaces:**
- Consumes: `logEvent` from Task 1.
- Produces: `registerCrashHandlers(): void` (registers `process.on` listeners — called once from `main/index.ts`), `registerWindowCrashHandlers(webContents: Electron.WebContents): void` (registers `webContents.on` listeners — called from `createWindow()`), and four individually-exported, directly-callable handler functions (`handleUncaughtException`, `handleUnhandledRejection`, `handleRenderProcessGone`, `handleUnresponsive`) that Task 4 does not depend on but the test in this task calls directly.

- [ ] **Step 1: Write the failing test**

`src/main/observability/crashHandlers.dbtest.ts`:

```typescript
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDb } from '../db/index'
import { listEvents } from '../db/repositories/eventLogRepo'
import {
  handleUncaughtException,
  handleUnhandledRejection,
  handleRenderProcessGone,
  handleUnresponsive
} from './crashHandlers'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('crash handlers', () => {
  it('logs an uncaught exception', () => {
    handleUncaughtException(new Error('main process boom'))

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('main:uncaughtException')
    expect(event.message).toBe('main process boom')
  })

  it('logs an unhandled rejection', () => {
    handleUnhandledRejection('rejected for no reason')

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('main:unhandledRejection')
    expect(event.message).toBe('rejected for no reason')
  })

  it('logs a renderer process gone event', () => {
    handleRenderProcessGone({ reason: 'crashed', exitCode: 1 } as Electron.RenderProcessGoneDetails)

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('renderer:render-process-gone')
    expect(event.message).toBe('crashed')
  })

  it('logs a renderer unresponsive event', () => {
    handleUnresponsive()

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('renderer:unresponsive')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `Cannot find module './crashHandlers'`.

- [ ] **Step 3: Implement the crash handlers**

`src/main/observability/crashHandlers.ts`:

```typescript
import type { WebContents, RenderProcessGoneDetails } from 'electron'
import { logEvent } from '../db/repositories/eventLogRepo'

export function handleUncaughtException(error: Error): void {
  logEvent({
    level: 'crash',
    source: 'main:uncaughtException',
    message: error.message,
    context: { stack: error.stack }
  })
}

export function handleUnhandledRejection(reason: unknown): void {
  logEvent({
    level: 'crash',
    source: 'main:unhandledRejection',
    message: String(reason),
    context: { reason }
  })
}

export function handleRenderProcessGone(details: RenderProcessGoneDetails): void {
  logEvent({
    level: 'crash',
    source: 'renderer:render-process-gone',
    message: details.reason,
    context: details
  })
}

export function handleUnresponsive(): void {
  logEvent({
    level: 'crash',
    source: 'renderer:unresponsive',
    message: 'Renderer became unresponsive'
  })
}

// Called once from main/index.ts inside app.whenReady().then(...).
export function registerCrashHandlers(): void {
  process.on('uncaughtException', handleUncaughtException)
  process.on('unhandledRejection', handleUnhandledRejection)
}

// Called from createWindow() once the BrowserWindow's webContents exists.
export function registerWindowCrashHandlers(webContents: WebContents): void {
  webContents.on('render-process-gone', (_event, details) => handleRenderProcessGone(details))
  webContents.on('unresponsive', handleUnresponsive)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS (4 new tests).

- [ ] **Step 5: Wire the handlers into `main/index.ts`**

In `src/main/index.ts`, add the import near the top:

```typescript
import { registerCrashHandlers, registerWindowCrashHandlers } from './observability/crashHandlers'
```

Inside `createWindow()`, right after the `mainWindow.webContents.setWindowOpenHandler(...)` block (currently ends around line 36), add:

```typescript
  registerWindowCrashHandlers(mainWindow.webContents)
```

Inside `app.whenReady().then(() => { ... })`, right after `registerAllIpc()` (currently line 61), add:

```typescript
  registerCrashHandlers()
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test:all`
Expected: PASS (all Node + dbtest suites, including the 4 new crash handler tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/observability/crashHandlers.ts src/main/observability/crashHandlers.dbtest.ts src/main/index.ts
git commit -m "feat: log main and renderer process crashes to event_log"
```

---

### Task 4: Diagnostic bundle export (main + IPC + preload + UI)

**Files:**
- Create: `src/main/export/diagnosticBundleExporter.ts`
- Test: `src/main/export/diagnosticBundleExporter.dbtest.ts`
- Modify: `src/main/ipc/export.ipc.ts`
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/state/queries/useExport.ts`
- Create: `src/renderer/src/components/settings/sections/DiagnosticsSection.tsx`
- Modify: `src/renderer/src/components/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `listEvents` from Task 1, `IPC.exportTrainingData`-style channel pattern already in `src/shared/types/ipc-contract.ts` and `src/main/ipc/export.ipc.ts`.
- Produces: `buildDiagnosticBundle(): DiagnosticBundle` and `exportDiagnosticBundle(): Promise<string | null>` (in `diagnosticBundleExporter.ts`); IPC channel `IPC.exportDiagnosticBundle = 'export:diagnosticBundle'`; `window.api.export.diagnosticBundle(): Promise<string | null>`; `useExportDiagnosticBundle(): UseMutationResult<string | null, Error, void>`.

- [ ] **Step 1: Write the failing test for the data-assembly function**

`src/main/export/diagnosticBundleExporter.dbtest.ts`:

```typescript
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDb } from '../db/index'
import { logEvent } from '../db/repositories/eventLogRepo'
import { buildDiagnosticBundle } from './diagnosticBundleExporter'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('buildDiagnosticBundle', () => {
  it('includes system info and logged events', () => {
    logEvent({ level: 'error', source: 'ipc:test', message: 'boom' })
    logEvent({ level: 'crash', source: 'main:uncaughtException', message: 'crashed' })

    const bundle = buildDiagnosticBundle()

    expect(bundle.systemInfo.appVersion).toEqual(expect.any(String))
    expect(bundle.systemInfo.osPlatform).toEqual(expect.any(String))
    expect(bundle.systemInfo.arch).toEqual(expect.any(String))
    expect(bundle.events).toHaveLength(2)
    expect(bundle.events.map((e) => e.source)).toEqual(
      expect.arrayContaining(['ipc:test', 'main:uncaughtException'])
    )
  })

  it('returns an empty events array when nothing has been logged', () => {
    const bundle = buildDiagnosticBundle()
    expect(bundle.events).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `Cannot find module './diagnosticBundleExporter'`.

- [ ] **Step 3: Implement the exporter**

`src/main/export/diagnosticBundleExporter.ts`:

```typescript
import { app, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { listEvents } from '../db/repositories/eventLogRepo'
import type { EventLogEntry } from '@shared/types/entities'

export interface DiagnosticBundle {
  systemInfo: {
    appVersion: string
    electronVersion: string
    osPlatform: string
    osVersion: string
    arch: string
    totalMemoryBytes: number
  }
  events: EventLogEntry[]
}

export function buildDiagnosticBundle(): DiagnosticBundle {
  return {
    systemInfo: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      osPlatform: process.platform,
      osVersion: os.release(),
      arch: process.arch,
      totalMemoryBytes: os.totalmem()
    },
    events: listEvents()
  }
}

export async function exportDiagnosticBundle(): Promise<string | null> {
  const dateStamp = new Date().toISOString().slice(0, 10)

  const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
  const result = await dialog.showSaveDialog(focusedWindow as BrowserWindow, {
    title: 'Export diagnostic bundle',
    defaultPath: join(app.getPath('downloads'), `diagnostic-bundle-${dateStamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null

  writeFileSync(result.filePath, JSON.stringify(buildDiagnosticBundle(), null, 2), 'utf-8')
  return result.filePath
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS (2 new tests).

- [ ] **Step 5: Add the IPC channel**

In `src/shared/types/ipc-contract.ts`, add after `exportTrainingData: 'export:trainingData'`:

```typescript
  exportTrainingData: 'export:trainingData',
  exportDiagnosticBundle: 'export:diagnosticBundle'
```

(remove the trailing comma from the now-not-last `exportTrainingData` line and add it to the new last line, keeping the object literal valid).

- [ ] **Step 6: Register the IPC handler**

In `src/main/ipc/export.ipc.ts`, add the import:

```typescript
import { exportDiagnosticBundle } from '../export/diagnosticBundleExporter'
```

And add, inside `registerExportIpc()`, after the `exportTrainingData` handler:

```typescript
  safeHandle(IPC.exportDiagnosticBundle, async (): Promise<string | null> => {
    const filePath = await exportDiagnosticBundle()
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })
```

- [ ] **Step 7: Expose it in the preload bridge**

In `src/preload/index.ts`, inside the `export: { ... }` object, add after `trainingData`:

```typescript
    trainingData: (): Promise<string | null> => ipcRenderer.invoke(IPC.exportTrainingData),
    diagnosticBundle: (): Promise<string | null> => ipcRenderer.invoke(IPC.exportDiagnosticBundle)
```

- [ ] **Step 8: Add the renderer hook**

In `src/renderer/src/state/queries/useExport.ts`, add:

```typescript
export function useExportDiagnosticBundle(): UseMutationResult<string | null, Error, void> {
  return useMutation({
    mutationFn: () => window.api.export.diagnosticBundle()
  })
}
```

- [ ] **Step 9: Add the Settings section**

`src/renderer/src/components/settings/sections/DiagnosticsSection.tsx`:

```typescript
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { useExportDiagnosticBundle } from '@renderer/state/queries/useExport'

export function DiagnosticsSection(): React.JSX.Element {
  const exportDiagnosticBundle = useExportDiagnosticBundle()

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Diagnostics</h3>
      <p className="text-xs text-text-secondary">
        Exports a local diagnostic bundle — recent app errors and crashes, plus basic system info
        (app version, OS, memory) — as a JSON file. Nothing is sent anywhere automatically; if you
        want to share this with the developer to help debug an issue, you choose to send the file
        yourself.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => exportDiagnosticBundle.mutate()}
        disabled={exportDiagnosticBundle.isPending}
      >
        {exportDiagnosticBundle.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export diagnostic bundle (.json)
      </Button>
    </div>
  )
}
```

- [ ] **Step 10: Wire the section into SettingsPage**

In `src/renderer/src/components/settings/SettingsPage.tsx`:

Add the import after `TrainingDataSection`:

```typescript
import { DiagnosticsSection } from './sections/DiagnosticsSection'
```

Add `'diagnostics'` to the `SectionId` union, after `'trainingData'`:

```typescript
  | 'trainingData'
  | 'diagnostics'
  | 'userManual'
```

Add the nav entry to `NAV_ITEMS`, after the `trainingData` entry:

```typescript
  { id: 'trainingData', label: 'Training Data' },
  { id: 'diagnostics', label: 'Diagnostics' },
```

Add the render branch, after the `trainingData` branch:

```typescript
          {activeSection === 'trainingData' && <TrainingDataSection />}
          {activeSection === 'diagnostics' && <DiagnosticsSection />}
```

- [ ] **Step 11: Run the full test suite**

Run: `npm run test:all`
Expected: PASS (all Node + dbtest suites, including the 6 new tests from this task).

- [ ] **Step 12: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS — this task touches shared types (`ipc-contract.ts`, `entities.ts`) consumed across main/preload/renderer, so a typecheck pass here is the real cross-process contract check.

- [ ] **Step 13: Live-verify the full observability feature**

Start the app (`npm run dev`), then:
1. Open Settings > Diagnostics, click "Export diagnostic bundle," save it, and open the file — confirm it contains `systemInfo` (with a real app version/OS/arch) and an `events` array (empty on a fresh dev profile, which is expected).
2. Trigger a real unexpected IPC error (e.g., temporarily disconnect network and attempt an AI extraction, or any other action that throws a non-`AppError`), then export another diagnostic bundle and confirm the new `error`-level event appears with the right `source` (`ipc:<channel>`) and `message`.
3. Confirm normal app usage (login, opening projects, etc.) produces zero new `event_log` rows — only the deliberately-triggered error above should appear, proving expected `AppError` failures (e.g. a wrong password) are correctly excluded per Task 2's design.

This is the live-verification step referenced in Task 2 — the `safeHandle.ts` wiring itself has no automated test (matching this codebase's existing convention of not unit-testing `ipc/*.ts` files), so this manual pass is what actually confirms it end-to-end.

- [ ] **Step 14: Commit**

```bash
git add src/main/export/diagnosticBundleExporter.ts src/main/export/diagnosticBundleExporter.dbtest.ts src/main/ipc/export.ipc.ts src/shared/types/ipc-contract.ts src/preload/index.ts src/renderer/src/state/queries/useExport.ts src/renderer/src/components/settings/sections/DiagnosticsSection.tsx src/renderer/src/components/settings/SettingsPage.tsx
git commit -m "feat: add diagnostic bundle export (Settings > Diagnostics)"
```
