# Self-Updating Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gist-based "notify and link out" update mechanism with `electron-updater`: the app checks, and — once the user explicitly confirms — downloads and installs a new version itself, restarting automatically when ready.

**Architecture:** `electron-updater`'s GitHub provider, configured for this private repo with a build-time-embedded, narrowly-scoped read-only token. `autoDownload` stays off until the user confirms; a single confirmation covers download-then-install (no second "restart now" click). This entirely replaces `src/main/updateCheck/` — deleted, not kept alongside the new module — since `electron-updater`'s own `update-available`/`update-not-available` events make the old manual version-string comparison redundant.

**Tech Stack:** New dependency `electron-updater`. Existing IPC/`safeHandle` pattern, existing React Query hook patterns, electron-vite's built-in `MAIN_VITE_`-prefixed env-var build-time injection (no new build tooling).

## Global Constraints

- **Manual prerequisite, not a coding task:** before this can be verified end-to-end, you (the developer) must create a GitHub fine-grained personal access token scoped to the `Qoutation` repo only, permission `Contents: Read-only`, and put it in a local `.env` file as `MAIN_VITE_UPDATE_TOKEN=<token>`. No task below can create this token — it's an interactive GitHub web UI action. Every coding task in this plan compiles, typechecks, and passes the existing test suite without it (an absent token just makes update checks fail closed, same as the old Gist mechanism failed closed when offline). Source: spec Component 1.
- No second "restart now" confirmation — download completion triggers install+relaunch immediately. Source: spec Component 4/7, "Out of scope."
- Nothing downloads until the user explicitly confirms (`autoDownload = false`). Source: spec Component 4, "Out of scope."
- Windows-only — no mac/linux publish/update wiring. Source: spec "Scope decision."
- `build:win` (used by `verify-installer.ps1`) must never publish a real release as a side effect — publishing is a separate, explicitly-invoked script. Source: spec Component 3.
- This codebase does not unit-test IPC handlers, preload wiring, or Settings/TopBar display components (confirmed throughout this session) — `electron-updater`'s actual download/install behavior is an OS-integration surface in the same untestable category as `verify-installer.ps1`'s territory. Coverage is typecheck + the existing suite staying green + a documented live manual test. Source: spec Component 7, "Testing."

---

### Task 1: Dependency, publish config, build script, env documentation

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: `import.meta.env.MAIN_VITE_UPDATE_TOKEN` (available in main-process code from Task 2 onward, once a local `.env` sets it); `npm run build:win:publish` script — a manual command, not consumed by any other task.

- [ ] **Step 1: Install `electron-updater`**

Run: `npm install electron-updater`
Expected: `package.json`'s `dependencies` gains an `electron-updater` entry; `package-lock.json` updates.

- [ ] **Step 2: Point `electron-builder.yml`'s publish config at real GitHub Releases**

Change:

```yaml
publish:
  provider: generic
  url: https://example.com/auto-updates
```

to:

```yaml
publish:
  provider: github
  owner: Elias-Brendon
  repo: Qoutation
  private: true
```

- [ ] **Step 3: Add the publish-and-release build script**

In `package.json`'s `scripts`, add after `"build:win": "npm run build && electron-builder --win",`:

```json
    "build:win:publish": "npm run build && electron-builder --win --publish always",
```

`build:win` itself is unchanged — it stays local-only, so `verify-installer.ps1` (which calls it) never accidentally publishes a real release.

- [ ] **Step 4: Document the runtime token env var**

In `.env.example`, add:

```
# Fine-grained GitHub token (Contents: Read-only, scoped to this repo only)
# used at BUILD time to let the packaged app authenticate against this
# private repo's Releases when checking for/downloading self-updates.
# Compiled into the app via electron-vite's MAIN_VITE_ build-time env
# convention — unlike ANTHROPIC_API_KEY above, this is NOT read at runtime.
# Leave unset for local/dev builds; self-update checks simply fail closed.
MAIN_VITE_UPDATE_TOKEN=
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (nothing references the new dependency or env var yet — this just confirms the install didn't break anything).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron-builder.yml .env.example
git commit -m "feat: add electron-updater dependency and GitHub publish config"
```

---

### Task 2: `src/main/updater/autoUpdater.ts` (replaces `src/main/updateCheck/`)

**Files:**
- Delete: `src/main/updateCheck/updateCheck.ts`
- Delete: `src/main/updateCheck/updateCheck.test.ts`
- Create: `src/main/updater/autoUpdater.ts`

**Interfaces:**
- Consumes: `UpdateStatus`, `UpdateCheckResult` (already in `@shared/types/entities.ts`, unchanged from the earlier manual-check plan).
- Produces: `initAutoUpdater(webContents: WebContents): void`, `checkForUpdate(): Promise<UpdateCheckResult>`, `getUpdateStatus(): UpdateStatus | null`, `downloadUpdate(): Promise<void>` — consumed by Task 3 (`initAutoUpdater`, `checkForUpdate`) and Task 4 (all four, via IPC handlers).

- [ ] **Step 1: Delete the old module**

```bash
git rm src/main/updateCheck/updateCheck.ts src/main/updateCheck/updateCheck.test.ts
rmdir src/main/updateCheck 2>/dev/null || true
```

- [ ] **Step 2: Check `electron-updater`'s actual check/error behavior before wiring the defensive check pattern below**

Read `node_modules/electron-updater/out/AppUpdater.d.ts` (or the installed version's equivalent) for `checkForUpdates()`'s documented return/rejection behavior and the `error` event's payload type. The implementation in Step 3 below assumes it *might* resolve without rejecting even on failure (hence racing an `error` listener against the promise) — if the installed version's types/docs confirm it always rejects reliably on failure, the extra listener is still harmless (mutually exclusive via `cleanup()`), so no behavior change is needed either way; this step is to catch a shape mismatch (e.g. a renamed method) before it causes a confusing runtime error later.

- [ ] **Step 3: Write the module**

```typescript
import { autoUpdater } from 'electron-updater'
import type { WebContents } from 'electron'
import type { UpdateStatus, UpdateCheckResult } from '@shared/types/entities'

// Compiled in at build time via electron-vite's MAIN_VITE_ env convention —
// see .env.example. Empty in dev/local builds, which makes every check fail
// closed (401 from GitHub) rather than throw; matches this app's existing
// "update checks are always best-effort" posture from the Gist-based
// mechanism this module replaces.
const UPDATE_TOKEN = import.meta.env.MAIN_VITE_UPDATE_TOKEN ?? ''

let cachedStatus: UpdateStatus | null = null

// Runs once per app launch (called from main/index.ts's app.whenReady()) and
// on-demand from the renderer's "Check for Updates" button (via the
// app:checkForUpdate IPC channel) — both share this one cache.
export function initAutoUpdater(webContents: WebContents): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.requestHeaders = { authorization: `token ${UPDATE_TOKEN}` }

  autoUpdater.on('update-available', (info) => {
    cachedStatus = {
      currentVersion: autoUpdater.currentVersion.version,
      latestVersion: info.version,
      isNewer: true
    }
  })
  autoUpdater.on('update-not-available', (info) => {
    cachedStatus = {
      currentVersion: autoUpdater.currentVersion.version,
      latestVersion: info.version,
      isNewer: false
    }
  })
  autoUpdater.on('download-progress', (progress) => {
    webContents.send('app:updateDownloadProgress', Math.round(progress.percent))
  })
  // A single user confirmation covers the whole action (design decision) —
  // once the download finishes, install and relaunch immediately, no
  // second "restart now" click.
  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall()
  })
  autoUpdater.on('error', (err) => {
    // Diagnostics only — see DEVELOPMENT.md's debugging checklist for what
    // each failure mode (401, no latest.yml, network) looks like here.
    console.error('[autoUpdater]', err)
  })
}

// Defensive: races a one-time error listener against the check promise,
// since not every electron-updater failure is guaranteed to reject the
// promise (see Step 2's verification note) — whichever settles first wins,
// and cleanup() ensures only one of them ever resolves this promise.
export function checkForUpdate(): Promise<UpdateCheckResult> {
  return new Promise((resolve) => {
    const cleanup = (): void => {
      autoUpdater.off('error', onError)
    }
    const onError = (): void => {
      cleanup()
      resolve({ status: cachedStatus, succeeded: false })
    }
    autoUpdater.once('error', onError)
    autoUpdater
      .checkForUpdates()
      .then(() => {
        cleanup()
        resolve({ status: cachedStatus, succeeded: true })
      })
      .catch(onError)
  })
}

export function getUpdateStatus(): UpdateStatus | null {
  return cachedStatus
}

// Unlike checkForUpdate, this is allowed to reject naturally — the
// app:downloadUpdate IPC handler (Task 4) awaits it directly, and safeHandle
// turns a rejection into an error the renderer's mutation can react to.
export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors. If `import.meta.env.MAIN_VITE_UPDATE_TOKEN` reports a type error, add a `MAIN_VITE_UPDATE_TOKEN: string` entry to whatever ambient `ImportMetaEnv` declaration electron-vite's template already provides (check `src/preload/electron-vite-env.d.ts` or similar — electron-vite scaffolds one by default) rather than inventing a new declaration file.

- [ ] **Step 5: Commit**

```bash
git add -A src/main/updateCheck src/main/updater
git commit -m "feat: replace Gist update check with electron-updater module"
```

---

### Task 3: Wire `main/index.ts`

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `initAutoUpdater`, `checkForUpdate` from Task 2.

- [ ] **Step 1: Update the import**

Change:

```typescript
import { checkForUpdate } from './updateCheck/updateCheck'
```

to:

```typescript
import { checkForUpdate, initAutoUpdater } from './updater/autoUpdater'
```

- [ ] **Step 2: Make `createWindow` return the window**

Change:

```typescript
function createWindow(): void {
```

to:

```typescript
function createWindow(): BrowserWindow {
```

and add `return mainWindow` as the last line of the function body (after the existing `if (is.dev ...) { ... } else { ... }` block).

- [ ] **Step 3: Capture the window and initialize the updater**

Change:

```typescript
  registerAllIpc()
  registerCrashHandlers()

  createWindow()
```

to:

```typescript
  registerAllIpc()
  registerCrashHandlers()

  const mainWindow = createWindow()
  initAutoUpdater(mainWindow.webContents)
```

- [ ] **Step 4: Update the launch-time check call**

Change the comment and call:

```typescript
  // Best-effort update check — never blocks startup; see updateCheck.ts.
  checkForUpdate(app.getVersion()).catch(() => {})
```

to:

```typescript
  // Best-effort update check — never blocks startup; see updater/autoUpdater.ts.
  checkForUpdate().catch(() => {})
```

(`checkForUpdate()` no longer takes a version argument — `electron-updater` reads the current version from the packaged app itself via `autoUpdater.currentVersion`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: initialize electron-updater on launch"
```

---

### Task 4: IPC — one new channel, two reused, one push event

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/app.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `checkForUpdate`, `getUpdateStatus`, `downloadUpdate` from Task 2.
- Produces: `window.api.app.downloadUpdate(): Promise<void>`, `window.api.app.onUpdateDownloadProgress(callback: (percent: number) => void): () => void` — consumed by Task 5's renderer hooks. `app.getUpdateStatus`/`app.checkForUpdate` keep their existing signatures unchanged.

- [ ] **Step 1: Add the new channel names**

In `src/shared/types/ipc-contract.ts`, change:

```typescript
  appGetVersion: 'app:getVersion',
  appGetUpdateStatus: 'app:getUpdateStatus',
  appCheckForUpdate: 'app:checkForUpdate',
```

to:

```typescript
  appGetVersion: 'app:getVersion',
  appGetUpdateStatus: 'app:getUpdateStatus',
  appCheckForUpdate: 'app:checkForUpdate',
  appDownloadUpdate: 'app:downloadUpdate',
  appUpdateDownloadProgress: 'app:updateDownloadProgress',
```

- [ ] **Step 2: Update the main-process handlers**

Replace `src/main/ipc/app.ipc.ts`'s contents:

```typescript
import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import { checkForUpdate, downloadUpdate, getUpdateStatus } from '../updater/autoUpdater'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
  safeHandle(IPC.appGetUpdateStatus, (): UpdateStatus | null => getUpdateStatus())
  safeHandle(IPC.appCheckForUpdate, (): Promise<UpdateCheckResult> => checkForUpdate())
  safeHandle(IPC.appDownloadUpdate, (): Promise<void> => downloadUpdate())
}
```

- [ ] **Step 3: Add the preload methods**

In `src/preload/index.ts`, change:

```typescript
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    getUpdateStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke(IPC.appGetUpdateStatus),
    checkForUpdate: (): Promise<UpdateCheckResult> => ipcRenderer.invoke(IPC.appCheckForUpdate)
  },
```

to:

```typescript
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    getUpdateStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke(IPC.appGetUpdateStatus),
    checkForUpdate: (): Promise<UpdateCheckResult> => ipcRenderer.invoke(IPC.appCheckForUpdate),
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.appDownloadUpdate),
    onUpdateDownloadProgress: (callback: (percent: number) => void): (() => void) => {
      const listener = (_event: unknown, percent: number): void => callback(percent)
      ipcRenderer.on(IPC.appUpdateDownloadProgress, listener)
      return () => ipcRenderer.removeListener(IPC.appUpdateDownloadProgress, listener)
    }
  },
```

(`UpdateCheckResult` and `UpdateStatus` are already imported in this file from the earlier manual-check plan — no import changes needed.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/app.ipc.ts src/preload/index.ts
git commit -m "feat: add app:downloadUpdate IPC channel and progress push event"
```

---

### Task 5: Renderer hooks

**Files:**
- Modify: `src/renderer/src/state/queries/useApp.ts`

**Interfaces:**
- Consumes: `window.api.app.downloadUpdate`, `window.api.app.onUpdateDownloadProgress` from Task 4.
- Produces: `useDownloadUpdate(): UseMutationResult<void, Error, void>`, `useUpdateDownloadProgress(): number | null`, `useUpdateInstall(): { isDownloading: boolean; didFail: boolean; percent: number | null; startUpdate: (latestVersion: string) => void }` — consumed by Task 6 (`TopBar.tsx`) and Task 7 (`AboutSection.tsx`).

- [ ] **Step 1: Replace the file's contents**

```typescript
import { useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export const updateStatusQueryKey = ['app', 'updateStatus'] as const

export function useAppVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => window.api.app.getVersion(),
    staleTime: Infinity
  })
}

export function useUpdateCheck(): UseQueryResult<UpdateStatus | null> {
  return useQuery({
    queryKey: updateStatusQueryKey,
    queryFn: () => window.api.app.getUpdateStatus(),
    staleTime: Infinity
  })
}

// Triggers a fresh update check (distinct from useUpdateCheck's read of the
// once-per-launch cached result). Writes straight into updateStatusQueryKey
// via setQueryData rather than invalidateQueries — the mutation's own fetch
// already refreshed the main-process cache, so a refetch here would just
// re-read the same value with an extra IPC round trip. This is also what
// makes the TopBar's update pill (which reads the same query key) reflect a
// manual check with no extra wiring.
export function useCheckForUpdate(): UseMutationResult<UpdateCheckResult, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.app.checkForUpdate(),
    onSuccess: (result) => {
      queryClient.setQueryData(updateStatusQueryKey, result.status)
    }
  })
}

export function useDownloadUpdate(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: () => window.api.app.downloadUpdate()
  })
}

// Percent (0-100) of the update currently downloading, or null before a
// download starts. ipcRenderer.on supports multiple independent listeners
// on one channel, so both TopBar and Settings can call this directly
// without needing shared global state the way extractionProgress does in
// useUiStore (that one is needed in many places at once; this is needed in
// exactly two).
export function useUpdateDownloadProgress(): number | null {
  const [percent, setPercent] = useState<number | null>(null)
  useEffect(() => window.api.app.onUpdateDownloadProgress(setPercent), [])
  return percent
}

// Shared confirm -> download -> progress flow for both UI surfaces
// (TopBar's pill and Settings' About section) that offer "install this
// update now". A single confirmation covers the whole action — once the
// download finishes, the main process installs and relaunches on its own
// (see updater/autoUpdater.ts's update-downloaded handler); there is
// nothing further for the renderer to do after starting the download.
export function useUpdateInstall(): {
  isDownloading: boolean
  didFail: boolean
  percent: number | null
  startUpdate: (latestVersion: string) => void
} {
  const download = useDownloadUpdate()
  const percent = useUpdateDownloadProgress()

  const startUpdate = (latestVersion: string): void => {
    const confirmed = window.confirm(
      `Update to v${latestVersion}? The app will download the update and restart automatically.`
    )
    if (!confirmed) return
    download.mutate()
  }

  return {
    isDownloading: download.isPending,
    didFail: download.isError,
    percent,
    startUpdate
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/state/queries/useApp.ts
git commit -m "feat: add update-download hooks (useDownloadUpdate, useUpdateInstall)"
```

---

### Task 6: `TopBar.tsx`'s `UpdateNotice` — confirm and install instead of link out

**Files:**
- Modify: `src/renderer/src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `useUpdateInstall()` from Task 5.

- [ ] **Step 1: Add the import**

Change:

```typescript
import { useUpdateCheck } from '@renderer/state/queries/useApp'
```

to:

```typescript
import { useUpdateCheck, useUpdateInstall } from '@renderer/state/queries/useApp'
```

- [ ] **Step 2: Replace the `UpdateNotice` component**

Replace the existing `UpdateNotice` function (currently rendering an `<a target="_blank">` linking to the Releases page) with:

```typescript
function UpdateNotice(): React.JSX.Element | null {
  const { data: status } = useUpdateCheck()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { isDownloading, didFail, percent, startUpdate } = useUpdateInstall()

  if (!status?.isNewer) return null
  const dismissed = settings?.dismissedUpdateVersion === status.latestVersion
  if (dismissed && !isDownloading && !didFail) return null

  if (isDownloading) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent">
        <Download className="h-3 w-3" />
        Downloading… {percent ?? 0}%
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent">
      <Download className="h-3 w-3" />
      <button
        type="button"
        onClick={() => startUpdate(status.latestVersion)}
        title={`Download and install v${status.latestVersion}`}
        className="hover:underline"
      >
        {didFail ? 'Update failed — retry' : `v${status.latestVersion} available`}
      </button>
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

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck:web`
Run: `npx eslint src/renderer/src/components/layout/TopBar.tsx`
Expected: no errors (existing unrelated CRLF warnings in this file are pre-existing, not introduced by this change).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/TopBar.tsx
git commit -m "feat: TopBar update pill downloads and installs instead of linking out"
```

---

### Task 7: `AboutSection.tsx` — "Update Now"

**Files:**
- Modify: `src/renderer/src/components/settings/sections/AboutSection.tsx`

**Interfaces:**
- Consumes: `useUpdateInstall()` from Task 5.

- [ ] **Step 1: Replace the file's contents**

```typescript
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import {
  useAppVersion,
  useCheckForUpdate,
  useUpdateCheck,
  useUpdateInstall
} from '@renderer/state/queries/useApp'

export function AboutSection(): React.JSX.Element {
  const { data: version } = useAppVersion()
  const { data: status } = useUpdateCheck()
  const checkForUpdate = useCheckForUpdate()
  const { isDownloading, didFail, percent, startUpdate } = useUpdateInstall()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">About</h3>
        <p className="mt-1 text-xs text-text-secondary">
          eQuotation{version ? ` v${version}` : ''}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkForUpdate.mutate()}
            disabled={checkForUpdate.isPending || isDownloading}
            className="w-fit"
          >
            {checkForUpdate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Check for Updates
          </Button>
          {status?.isNewer && !isDownloading && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => startUpdate(status.latestVersion)}
              className="w-fit"
            >
              <Download className="h-3.5 w-3.5" />
              Update Now
            </Button>
          )}
        </div>
        <UpdateStatusLine
          isPending={checkForUpdate.isPending}
          lastCheckSucceeded={checkForUpdate.data?.succeeded}
          status={status ?? null}
          isDownloading={isDownloading}
          didFail={didFail}
          percent={percent}
        />
      </div>

      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p className="font-semibold">Beta software</p>
          <p className="mt-0.5">
            This is a beta release — expect bugs. Use for evaluation, not production-critical
            work without a backup.
          </p>
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-text-primary">Data handling</h4>
        <ul className="flex flex-col gap-1 text-xs text-text-secondary">
          <li>
            • SLD PDFs you upload are sent to Anthropic&apos;s Claude API for component
            extraction.
          </li>
          <li>• Currency conversion queries Frankfurter&apos;s public API.</li>
          <li>• All project data is stored locally on this machine.</li>
          <li>• No data is sent to the developer or any other third party.</li>
        </ul>
      </div>

      <p className="text-xs text-text-muted">© 2026 Elias Brendon. All rights reserved.</p>
    </div>
  )
}

interface UpdateStatusLineProps {
  isPending: boolean
  // undefined until a manual check has run at least once this session —
  // distinguishes "never manually checked" from "manually checked and failed".
  lastCheckSucceeded: boolean | undefined
  status: { latestVersion: string; isNewer: boolean } | null
  isDownloading: boolean
  didFail: boolean
  percent: number | null
}

// Priority order: an in-progress or just-failed download outranks the
// check-pending/check-failed states, which outrank a stale "available" or
// "up to date" line — always show the most current thing that's true.
function UpdateStatusLine({
  isPending,
  lastCheckSucceeded,
  status,
  isDownloading,
  didFail,
  percent
}: UpdateStatusLineProps): React.JSX.Element {
  if (isDownloading) {
    return <p className="text-xs text-accent">Downloading update… {percent ?? 0}%</p>
  }

  if (didFail) {
    return <p className="text-xs text-danger">Update failed to download — try again.</p>
  }

  if (isPending) {
    return <p className="text-xs text-text-muted">Checking for updates…</p>
  }

  if (lastCheckSucceeded === false) {
    return (
      <p className="text-xs text-danger">
        Couldn&apos;t check for updates — check your connection and try again.
      </p>
    )
  }

  if (status?.isNewer) {
    return (
      <p className="flex items-center gap-1 text-xs text-accent">
        <Download className="h-3 w-3" />
        Update available: v{status.latestVersion}
      </p>
    )
  }

  if (status) {
    return <p className="text-xs text-text-muted">You&apos;re up to date.</p>
  }

  return <p className="text-xs text-text-muted">Not checked yet.</p>
}
```

(This removes the `RELEASES_URL` constant and the "get it here" link from the earlier manual-check plan — the status line no longer links out, since "Update Now" does the actual work.)

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck:web`
Run: `npx eslint src/renderer/src/components/settings/sections/AboutSection.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/settings/sections/AboutSection.tsx
git commit -m "feat: add Update Now to Settings About section"
```

---

### Task 8: Full test suite, live verification, and `DEVELOPMENT.md`

**Files:**
- Modify: `DEVELOPMENT.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:all`
Expected: all existing tests pass (this plan adds no new test files, matching Global Constraints — the manual-check plan's 3 `checkForUpdate` tests are gone along with the deleted `updateCheck.test.ts`, so the count drops back to 104, then whatever the current baseline is).

- [ ] **Step 2: Live-verify the parts that don't need a real token**

Run: `npm run dev`. Confirm the app launches with no errors (the update check will fail closed with an empty token — expected, matches the documented behavior). Open Settings → About: confirm "Check for Updates" still shows the "couldn't check for updates" state cleanly (proves the failure path renders correctly) rather than crashing.

- [ ] **Step 3: Rewrite `DEVELOPMENT.md`'s update section**

Replace the "Release workflow" section and its "How the app checks for updates (for debugging)" subsection (added by the earlier manual-check plan) with:

```markdown
## Release workflow

1. Land your changes on `master` with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, ...).
2. `npm run release` — bumps `package.json` version (plain semver, no prerelease suffix), regenerates `CHANGELOG.md`, commits, tags `vX.Y.Z`.
3. `git push --follow-tags`.
4. Ensure `GH_TOKEN` (a personal token with `repo` scope — e.g. `gh auth token`) is set in your shell, then run `npm run build:win:publish`. This builds, then uploads the installer and `latest.yml` to a real GitHub Release for the tag — this is what makes the app-side self-update actually see the new version. Use plain `npm run build:win` (no publish) for local testing/`npm run verify:installer` runs.
5. Testers (added as read-only GitHub collaborators on this private repo) either wait for the in-app update notice or download manually from the Releases page.

### How self-update works (for debugging)

Uses `electron-updater`'s GitHub provider (`src/main/updater/autoUpdater.ts`), authenticated against this private repo with a fine-grained, read-only, repo-scoped token embedded at build time via `MAIN_VITE_UPDATE_TOKEN` (see `.env.example`) — electron-vite's built-in `MAIN_VITE_`-prefixed env convention compiles it into the main-process bundle, distinct from and unrelated to the runtime `.env` loading (`loadEnv()` in `main/index.ts`) used for the dev-only Anthropic key.

- **On launch and on manual "Check for Updates"**, `checkForUpdate()` calls `autoUpdater.checkForUpdates()`, which fetches `latest.yml` from the repo's most recent GitHub Release. `update-available`/`update-not-available` events populate an in-memory cache, read by both the TopBar pill and Settings → About via the shared `useUpdateCheck()` query — one cache, two UI surfaces, same as before.
- **Nothing downloads automatically.** Clicking "Update Now" (Settings) or the TopBar pill itself calls `window.confirm(...)`, then `downloadUpdate()` → `autoUpdater.downloadUpdate()`. Progress streams to the renderer via the `app:updateDownloadProgress` push event, shown as "Downloading… NN%" on both surfaces.
- **Install is automatic once downloaded** — no second confirmation. `autoUpdater`'s `update-downloaded` event calls `quitAndInstall()` directly; the app closes and relaunches on the new version on its own.

**How to test a real self-update end-to-end** (needs an actual published release — not something a unit test can cover):

1. Make sure a local `.env` has a real `MAIN_VITE_UPDATE_TOKEN` (see Task 1 of `docs/superpowers/plans/2026-08-06-self-updating-installer.md` for how to create the token) and `GH_TOKEN` is set in your shell.
2. Install the *current* released version on a test machine/VM (or just use your current dev install).
3. Bump the version and publish a real new release: `npm run release` → `git push --follow-tags` → `npm run build:win:publish`.
4. On the test install, open Settings → About and click "Check for Updates" (or just relaunch — the launch-time check will find it too).
5. Confirm the "Update Now"/TopBar pill appears with the new version number, click it, confirm the `window.confirm` dialog, and watch the download percentage climb.
6. Confirm the app quits and relaunches automatically once the download completes, and that `About` now shows the new version.

**Debugging checklist:**
- **"Check for Updates always fails" / 401-shaped errors in the console:** the embedded token is missing, expired, or was revoked — regenerate it on GitHub and rebuild with `build:win:publish` using the new value in `.env`.
- **"No update found even though a newer tag/version exists":** confirm a *GitHub Release* (not just a git tag) exists for that version with `latest.yml` and the installer attached — `npm run release` only tags; only `npm run build:win:publish` actually publishes a Release. `gh release list --repo Elias-Brendon/Qoutation` shows what's actually published.
- **Download starts but fails partway:** almost always a network interruption — `didFail`/"Update failed to download — try again" surfaces this in both UI surfaces; the user can just click again.
- **App doesn't relaunch after "Downloading… 100%"**: check the main-process console for the `update-downloaded` handler's `quitAndInstall()` call — a code-signing mismatch between the installed version and the new installer is the most common real-world cause (this app doesn't currently code-sign, so this is unlikely to bite in this project specifically, but worth knowing if that ever changes).
```

- [ ] **Step 4: Commit**

```bash
git add DEVELOPMENT.md
git commit -m "docs: rewrite update docs for electron-updater"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 (token/env) → Task 1. Component 2 (electron-builder.yml) → Task 1. Component 3 (publish script) → Task 1. Component 4 (autoUpdater.ts module) → Task 2. Component 5 (main/index.ts wiring) → Task 3. Component 6 (IPC) → Task 4. Component 7 (renderer confirm/download/progress) → Tasks 5-7. Component 8 (documentation) → Task 8.
- **No dedicated tests added**, matching this codebase's established convention for IPC/integration glue — see Global Constraints. Coverage is typecheck (every task), the full suite staying green (Task 8), and a documented live two-version test (Task 8's `DEVELOPMENT.md` addition) that a human runs when an actual token and a real second release exist — neither of which any coding task depends on.
- **Type consistency check:** `UpdateStatus`/`UpdateCheckResult` (unchanged from the earlier manual-check plan, already in `@shared/types/entities.ts`) are used identically across Task 2's module, Task 4's IPC handlers and preload, and Task 5's hooks. `useUpdateInstall()`'s return shape (`isDownloading`, `didFail`, `percent`, `startUpdate`) is defined once in Task 5 and consumed identically (same field names) in Task 6 and Task 7 — no drift between the two call sites.
- **Dead code check:** Task 7 explicitly calls out removing `RELEASES_URL` and the "get it here" link from the prior plan's `AboutSection.tsx` — confirmed by writing the full replacement file rather than an incremental diff, so nothing stale survives.
