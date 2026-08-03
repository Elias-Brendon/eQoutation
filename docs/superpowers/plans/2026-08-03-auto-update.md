# Auto-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check once per app launch whether a newer version is published (via a hand-edited public Gist), and show a small dismissible TopBar notice linking testers to the private repo's Releases page — no silent download, no embedded credentials.

**Architecture:** A pure `isNewerVersion` comparator plus a best-effort `fetchLatestVersion`/`checkForUpdate` pair in a new `updateCheck.ts` module, called once from `main/index.ts` alongside the existing best-effort FX-refresh call. Status is cached in memory and read by a new IPC handler. Dismissal reuses the *existing* generic `settingsUpdate` IPC/`useUpdateSettings` hook — no new IPC needed for that part — via a new nullable `dismissedUpdateVersion` field on `AppSettings`. The TopBar link is a plain `<a target="_blank">`, which Electron's existing `setWindowOpenHandler` (already in `main/index.ts`) routes to the OS browser — no new IPC needed for that either.

**Tech Stack:** Native `fetch` (no new dependency), existing React Query hook patterns, existing `settingsStore.ts` JSON-file settings persistence.

## Global Constraints

- The Gist raw URL is hardcoded (verified working, returns `{"latestVersion":"0.1.0"}` with `200 OK`): `https://gist.githubusercontent.com/Elias-Brendon/2438ef103e436029a7eaa1cde107e715/raw`. Source: spec Component 1 (confirmed live before writing this plan).
- `fetchLatestVersion`/`checkForUpdate` must never throw and must never block app startup — any failure (offline, bad JSON, non-200) leaves the cached status `null`. Source: spec Component 3.
- Version comparison is plain three-part numeric `major.minor.patch` — no semver library, no prerelease-suffix handling (this project only ever produces plain `X.Y.Z`, per sub-project 2). Source: spec Component 3.
- The Releases link (`https://github.com/Elias-Brendon/Qoutation/releases`) is hardcoded, not derived from the Gist payload. Source: spec Component 5.
- No silent download/install, no embedded GitHub token, no code-signing infrastructure, no in-app changelog/release-notes display. Source: spec "Out of scope."

---

### Task 1: Update-check logic (pure comparator + best-effort fetch)

**Files:**
- Create: `src/main/updateCheck/updateCheck.ts`
- Test: `src/main/updateCheck/updateCheck.test.ts`
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `UpdateStatus { currentVersion: string; latestVersion: string; isNewer: boolean }` (in `src/shared/types/entities.ts`); `isNewerVersion(latest: string, current: string): boolean`, `checkForUpdate(currentVersion: string): Promise<void>`, `getUpdateStatus(): UpdateStatus | null` (in `src/main/updateCheck/updateCheck.ts`) — consumed by Task 2's IPC handler.

- [ ] **Step 1: Add the shared type**

In `src/shared/types/entities.ts`, append at the end of the file (after the existing `ExtractionProgressEvent` interface):

```typescript
export interface UpdateStatus {
  currentVersion: string
  latestVersion: string
  isNewer: boolean
}
```

- [ ] **Step 2: Write the failing test**

`src/main/updateCheck/updateCheck.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isNewerVersion } from './updateCheck'

describe('isNewerVersion', () => {
  it('returns true when the latest major version is higher', () => {
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
  })

  it('returns true when the latest minor version is higher', () => {
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
  })

  it('returns true when the latest patch version is higher', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
  })

  it('returns false when the latest version is older than current', () => {
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- updateCheck`
Expected: FAIL — `Cannot find module './updateCheck'`.

- [ ] **Step 4: Implement the module**

`src/main/updateCheck/updateCheck.ts`:

```typescript
import type { UpdateStatus } from '@shared/types/entities'

// Public Gist, hand-edited by the developer after each release (see
// docs/superpowers/specs/2026-08-03-auto-update-design.md for why this
// exists instead of full electron-updater: the repo is private, and a
// handful of known beta testers doesn't justify either exposing releases
// publicly or embedding a GitHub token in the app). Verified live
// 2026-08-03: returns {"latestVersion":"0.1.0"} with 200 OK.
const LATEST_VERSION_GIST_URL =
  'https://gist.githubusercontent.com/Elias-Brendon/2438ef103e436029a7eaa1cde107e715/raw'

let cachedStatus: UpdateStatus | null = null

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number)
  const currentParts = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] ?? 0
    const c = currentParts[i] ?? 0
    if (l !== c) return l > c
  }
  return false
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_VERSION_GIST_URL)
    if (!response.ok) return null
    const payload = (await response.json()) as { latestVersion?: unknown }
    return typeof payload.latestVersion === 'string' ? payload.latestVersion : null
  } catch {
    return null
  }
}

// Runs once per app launch (called from main/index.ts's app.whenReady()).
// Best-effort: any failure (offline, gist unreachable, malformed payload)
// leaves cachedStatus null, and getUpdateStatus() simply reports "no
// update info yet" rather than throwing or blocking startup.
export async function checkForUpdate(currentVersion: string): Promise<void> {
  const latestVersion = await fetchLatestVersion()
  if (!latestVersion) return
  cachedStatus = {
    currentVersion,
    latestVersion,
    isNewer: isNewerVersion(latestVersion, currentVersion)
  }
}

export function getUpdateStatus(): UpdateStatus | null {
  return cachedStatus
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- updateCheck`
Expected: PASS (5 new tests).

- [ ] **Step 6: Wire it into `main/index.ts`**

Add the import near the top:

```typescript
import { checkForUpdate } from './updateCheck/updateCheck'
```

Inside `app.whenReady().then(() => { ... })`, right after the existing `refreshStaleProjectExchangeRates().catch(() => {})` line, add:

```typescript
  // Best-effort update check — never blocks startup; see updateCheck.ts.
  checkForUpdate(app.getVersion()).catch(() => {})
```

- [ ] **Step 7: Run the full test suite**

Run: `npm run test:all`
Expected: PASS (all Node + dbtest suites, including the 5 new tests).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/entities.ts src/main/updateCheck/updateCheck.ts src/main/updateCheck/updateCheck.test.ts src/main/index.ts
git commit -m "feat: add best-effort update-availability check"
```

---

### Task 2: IPC, settings field, and renderer hooks

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/settings/settingsStore.ts`
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/app.ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/state/queries/useApp.ts`

**Interfaces:**
- Consumes: `getUpdateStatus` from Task 1.
- Produces: `window.api.app.getUpdateStatus(): Promise<UpdateStatus | null>`; `useUpdateCheck(): UseQueryResult<UpdateStatus | null>` — consumed by Task 3's TopBar UI, alongside the *existing* `useSettings()`/`useUpdateSettings()` hooks (unchanged signatures) for reading/writing `dismissedUpdateVersion`.

- [ ] **Step 1: Add the settings field to the shared type**

In `src/shared/types/entities.ts`, in the existing `AppSettings` interface, add after `annotationFontSize: number`:

```typescript
  annotationFontSize: number
  /** Latest version the user dismissed the "update available" notice for — null if never dismissed. */
  dismissedUpdateVersion: string | null
```

- [ ] **Step 2: Wire the field through `settingsStore.ts`**

In `src/main/settings/settingsStore.ts`, in `defaultSettings()`, add after `annotationFontSize: 12`:

```typescript
    annotationFontSize: 12,
    dismissedUpdateVersion: null
```

In `getSettings()`'s merge block, add after `annotationFontSize: parsed.annotationFontSize ?? defaults.annotationFontSize`:

```typescript
      annotationFontSize: parsed.annotationFontSize ?? defaults.annotationFontSize,
      dismissedUpdateVersion: parsed.dismissedUpdateVersion ?? defaults.dismissedUpdateVersion
```

- [ ] **Step 3: Add the IPC channel**

In `src/shared/types/ipc-contract.ts`, add after `appGetVersion: 'app:getVersion',`:

```typescript
  appGetVersion: 'app:getVersion',
  appGetUpdateStatus: 'app:getUpdateStatus',
```

- [ ] **Step 4: Register the IPC handler**

In `src/main/ipc/app.ipc.ts`:

```typescript
import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import { getUpdateStatus } from '../updateCheck/updateCheck'
import type { UpdateStatus } from '@shared/types/entities'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
  safeHandle(IPC.appGetUpdateStatus, (): UpdateStatus | null => getUpdateStatus())
}
```

- [ ] **Step 5: Expose it in the preload bridge**

In `src/preload/index.ts`, inside the `app: { ... }` object:

```typescript
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    getUpdateStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke(IPC.appGetUpdateStatus)
  },
```

(Add `UpdateStatus` to the existing `@shared/types/entities` import at the top of the file if not already imported.)

- [ ] **Step 6: Add the renderer hook**

In `src/renderer/src/state/queries/useApp.ts`:

```typescript
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { UpdateStatus } from '@shared/types/entities'

export function useAppVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => window.api.app.getVersion(),
    staleTime: Infinity
  })
}

export function useUpdateCheck(): UseQueryResult<UpdateStatus | null> {
  return useQuery({
    queryKey: ['app', 'updateStatus'],
    queryFn: () => window.api.app.getUpdateStatus(),
    staleTime: Infinity
  })
}
```

- [ ] **Step 7: Run the full test suite, typecheck, and lint**

Run: `npm run test:all && npm run typecheck && npm run lint`
Expected: all PASS — this task touches shared types and the IPC/preload contract, so the typecheck pass is the real cross-process check (no new automated test is added in this task: it's pure wiring, matching this codebase's existing convention of not unit-testing `ipc/*.ts` or preload files).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/entities.ts src/main/settings/settingsStore.ts src/shared/types/ipc-contract.ts src/main/ipc/app.ipc.ts src/preload/index.ts src/renderer/src/state/queries/useApp.ts
git commit -m "feat: expose update status over IPC, add dismissedUpdateVersion setting"
```

---

### Task 3: TopBar notice

**Files:**
- Modify: `src/renderer/src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `useUpdateCheck()` from Task 2; the *existing* `useSettings()`/`useUpdateSettings()` hooks from `src/renderer/src/state/queries/useSettings.ts` (already imported nowhere in `TopBar.tsx` yet — this task adds the import).

- [ ] **Step 1: Add the imports**

In `src/renderer/src/components/layout/TopBar.tsx`, add to the existing import block:

```typescript
import { useUpdateCheck } from '@renderer/state/queries/useApp'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
```

Also add `Download` and `X` to the existing `lucide-react` import line (currently `Archive, Database, Flag, Info, Loader2, Plus, RefreshCw, Upload, User`):

```typescript
import {
  Archive,
  Database,
  Download,
  Flag,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  User,
  X
} from 'lucide-react'
```

- [ ] **Step 2: Add the `UpdateNotice` component**

At the end of `src/renderer/src/components/layout/TopBar.tsx` (after the existing `FlagBadge` function), add:

```typescript
function UpdateNotice(): React.JSX.Element | null {
  const { data: status } = useUpdateCheck()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  if (!status?.isNewer) return null
  if (settings?.dismissedUpdateVersion === status.latestVersion) return null

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent">
      <Download className="h-3 w-3" />
      <a
        href="https://github.com/Elias-Brendon/Qoutation/releases"
        target="_blank"
        rel="noreferrer"
        title={`Version ${status.latestVersion} is available — opens the Releases page`}
        className="hover:underline"
      >
        v{status.latestVersion} available
      </a>
      <button
        type="button"
        onClick={() => updateSettings.mutate({ dismissedUpdateVersion: status.latestVersion })}
        title="Dismiss until the next update"
        aria-label="Dismiss update notice"
        className="text-accent/70 hover:text-accent"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Render it in the TopBar**

In the main `TopBar` function's returned JSX, add `<UpdateNotice />` right before the closing `</div>` of the `flex items-center gap-2` block that currently holds the three `FlagBadge`s (so it sits alongside the flag badges, before the action buttons):

```typescript
      <div className="flex items-center gap-2">
        <FlagBadge tone="text-warning" count={matcherFlagCount} label="Matcher" compact={compact} />
        <FlagBadge tone="text-danger" count={aiFlagCount} label="AI" compact={compact} />
        <FlagBadge tone="text-warning" count={manualFlagCount} label="Manual" compact={compact} />
        <UpdateNotice />
      </div>
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test:all`
Expected: PASS — no test coverage is added in this task (this codebase has no component-level render tests anywhere; UI wiring is consistently live-verified, matching the pattern from every other Settings/TopBar addition in this project).

- [ ] **Step 6: Live-verify**

Start the app (`npm run dev`). Since the app's own `package.json` version (`0.1.0`) matches the Gist's current `latestVersion` (`0.1.0`), the notice should **not** appear yet — confirm the TopBar looks unchanged. Then temporarily edit the Gist's `latestVersion` to `0.2.0` (via gist.github.com), restart the app, and confirm: the notice appears ("v0.2.0 available"), clicking the version text opens `https://github.com/Elias-Brendon/Qoutation/releases` in the default browser, and clicking the × dismisses it — restart again and confirm it stays dismissed. Afterward, edit the Gist back to `latestVersion: "0.1.0"` to leave it accurate for real use.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/layout/TopBar.tsx
git commit -m "feat: show a dismissible TopBar notice when a new version is available"
```
