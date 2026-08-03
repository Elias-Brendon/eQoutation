# Observability — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** Beta-packaging initiative, sub-project 4 of 5 (see `project_remaining_stages_roadmap` memory). Scope per the roadmap: "error logging, crash reports, system info, diagnostic bundle as a structured action/event log — NOT screen recording, debug mode, user-friendly crash screen." Sub-projects 1–3 (branding, version system, installer verification) are complete.

## Goal

Persist errors, crashes, and enough system context for the developer to diagnose a beta tester's bug report, without any automatic upload — everything stays local until the user explicitly exports it. This closes a real gap: today every unexpected error only reaches `console.error`, which is invisible in a packaged build (no DevTools, no file), and crashes (main-process exceptions, renderer-process crashes/hangs) are entirely unhandled.

## Privacy stance

Purely local, user-initiated export — no network call, no telemetry, no automatic upload anywhere. This matches the existing Settings > About disclosure (sub-project 1) verbatim ("nothing to the developer" besides the Claude/Frankfurter API calls the app already discloses) — no changes to that disclosure's wording are needed, since a locally-stored, user-exported log doesn't contradict it.

## Components

### 1. `event_log` table

New migration `src/main/db/migrations/0025_event_log.ts`:

```sql
CREATE TABLE event_log (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('error', 'crash')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  error_code TEXT NULL,
  context TEXT NULL,
  created_at TEXT NOT NULL
);
```

- `source` is a short dotted string identifying where the event came from — `ipc:<channel>` for errors caught at the IPC boundary, `main:uncaughtException` / `main:unhandledRejection` / `renderer:render-process-gone` / `renderer:unresponsive` for crashes.
- `error_code` is nullable and, when set, matches an existing key from `ERROR_CODES` (`src/shared/errors/errorCodes.ts`) — populated only when the caught error is an `AppError`; raw/unexpected errors leave it null.
- `context` is a nullable JSON string for anything extra worth capturing (e.g. the renderer crash `reason`/`exitCode` from Electron's event, or a raw error's stack trace) — free-form per source, not a fixed schema.
- No retention/pruning policy: this table only grows on errors and crashes (not on every action), so unbounded growth isn't a realistic near-term concern for a beta app. Revisit if it becomes one.

New `src/main/db/repositories/eventLogRepo.ts`, mirroring the existing repo pattern (e.g. `feedbackLogRepo.ts`):
- `logEvent(entry: { level: 'error' | 'crash'; source: string; message: string; errorCode?: string; context?: unknown }): void` — serializes `context` to JSON internally if provided, generates `id`/`created_at`.
- `listEvents(limit?: number): EventLogEntry[]` — most recent first; used by the diagnostic bundle exporter.

### 2. Error logging

`src/main/ipc/safeHandle.ts`'s existing `console.error(...)` call (in the `catch` branch, for non-`AppError` failures) gets a sibling call to `logEvent({ level: 'error', source: `ipc:${channel}`, message: String(error), context: { stack: error instanceof Error ? error.stack : undefined } })`. The `console.error` line stays as-is — it's still useful in `npm run dev` with DevTools open; the DB write is additive, not a replacement.

### 3. Crash reporting

New `src/main/observability/crashHandlers.ts`, exporting a single `registerCrashHandlers(): void` called once from `main/index.ts` inside `app.whenReady().then(...)`, after `registerAllIpc()`:

- `process.on('uncaughtException', (error) => logEvent({ level: 'crash', source: 'main:uncaughtException', message: error.message, context: { stack: error.stack } }))`
- `process.on('unhandledRejection', (reason) => logEvent({ level: 'crash', source: 'main:unhandledRejection', message: String(reason), context: { reason } }))`
- On the `BrowserWindow`'s `webContents`, registered inside `createWindow()`: `.on('render-process-gone', (_event, details) => logEvent({ level: 'crash', source: 'renderer:render-process-gone', message: details.reason, context: details }))` and `.on('unresponsive', () => logEvent({ level: 'crash', source: 'renderer:unresponsive', message: 'Renderer became unresponsive' }))`.

None of these handlers change what Electron does after the event (no custom crash screen, no forced quit/restart logic) — they only observe and persist. This is explicitly not a replacement for Electron's default crash behavior, per the roadmap's "not a user-friendly crash screen" boundary.

### 4. Diagnostic bundle export

New Settings section `src/renderer/src/components/settings/sections/DiagnosticsSection.tsx`, structurally identical to the existing `TrainingDataSection.tsx` (description text + a single outline button with a loading spinner state), wired to a new `useExportDiagnosticBundle` hook calling a new `diagnostics:exportBundle` IPC channel.

Main-process implementation `src/main/export/diagnosticBundleExporter.ts`, mirroring `trainingDataExporter.ts`'s `dialog.showSaveDialog` pattern (default path in Downloads, filename `diagnostic-bundle-<date>.json`, `.json` file filter). The exported file is a single JSON document (not a zip — everything in it is text, so an archive step adds a dependency for no benefit):

```json
{
  "systemInfo": {
    "appVersion": "0.1.0",
    "electronVersion": "39.8.10",
    "osPlatform": "win32",
    "osVersion": "...",
    "arch": "x64",
    "totalMemoryBytes": 0
  },
  "events": [ /* up to the last 500 event_log rows, most recent first */ ]
}
```

`systemInfo` is gathered via Electron/Node's own APIs (`app.getVersion()`, `process.versions.electron`, `process.platform`, `os.release()`, `process.arch`, `os.totalmem()`) at export time — no new storage, computed fresh each export.

## Out of scope

Per the roadmap's own boundary for this sub-project:
- Screen recording of any kind.
- A "debug mode" toggle or verbose logging level control.
- A custom user-friendly crash screen/dialog (Electron's default behavior on an unhandled main-process exception — process exit — is unchanged).
- Automatic upload, telemetry, or any network transmission of logged events.
- Logging successful action milestones (extraction complete, export succeeded, etc.) — only errors and crashes are captured, per this sub-project's explicit scope decision during brainstorming.
- Log retention/pruning policy — not needed at current expected volume; revisit later if it becomes a real problem.
