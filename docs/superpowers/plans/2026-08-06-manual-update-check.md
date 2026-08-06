# Manual Check-for-Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user manually trigger a fresh update check from Settings (About section), showing the result there and feeding the same cache the existing TopBar "update available" pill already reads — plus document the whole update mechanism (code comments + `DEVELOPMENT.md`) for future debugging.

**Architecture:** `updateCheck.ts`'s `checkForUpdate()` starts returning whether its fetch succeeded (it already updates the module-level cache as a side effect — that part is unchanged). A new IPC channel calls it on demand and returns the refreshed status plus that success flag. A renderer mutation hook calls the IPC channel and writes the result straight into the React Query cache key the existing `useUpdateCheck()` query already uses, so both the new Settings display and the existing TopBar pill update from one write. `AboutSection.tsx` adds a button and a status line driven by that same query plus the mutation's own pending/result state.

**Tech Stack:** Existing IPC/`safeHandle` pattern, existing React Query (`@tanstack/react-query`) hook patterns, existing `Button`/lucide-react icon conventions. No new dependencies.

## Global Constraints

- The launch-time check in `main/index.ts` (`checkForUpdate(app.getVersion()).catch(() => {})`) must keep failing silently — do not change its call site's error-handling behavior. Source: spec Component 1.
- The manual check path must surface failure to the user (this is the whole point of adding it) — but only for the manual path, never retroactively for a launch-time failure. Source: spec Component 4, state 2.
- No toast/popup notification is being added. The TopBar pill (`UpdateNotice` in `TopBar.tsx`) is unchanged except that it now also reflects a manual check's result, via the shared query cache key — not via new code in `TopBar.tsx` itself. Source: spec "Scope decision".
- The Releases URL (`https://github.com/Elias-Brendon/Qoutation/releases`) used in `AboutSection.tsx`'s new link must be the exact same hardcoded string already used in `TopBar.tsx`'s `UpdateNotice`. Source: spec Component 4.
- No new npm dependency, no `electron-updater`, no silent download/install. Source: original 2026-08-03 spec, reaffirmed by this spec's "Scope decision".

---

### Task 1: `checkForUpdate` returns whether the fetch succeeded

**Files:**
- Modify: `src/main/updateCheck/updateCheck.ts`
- Modify: `src/main/updateCheck/updateCheck.test.ts`

**Interfaces:**
- Produces: `checkForUpdate(currentVersion: string): Promise<boolean>` (was `Promise<void>`) — consumed by Task 3's IPC handler. `getUpdateStatus(): UpdateStatus | null` is unchanged and still consumed by the existing `appGetUpdateStatus` handler.

- [ ] **Step 1: Write the failing tests**

Add to `src/main/updateCheck/updateCheck.test.ts` (new `describe` block, alongside the existing `isNewerVersion` one — the file has no test doubles for `fetch` yet, so this introduces the first one):

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, getUpdateStatus, isNewerVersion } from './updateCheck'

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true and updates the cached status when the fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ latestVersion: '9.9.9' })
      })
    )

    const succeeded = await checkForUpdate('0.1.0')

    expect(succeeded).toBe(true)
    expect(getUpdateStatus()).toEqual({
      currentVersion: '0.1.0',
      latestVersion: '9.9.9',
      isNewer: true
    })
  })

  it('returns false when the fetch fails, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const succeeded = await checkForUpdate('0.1.0')

    expect(succeeded).toBe(false)
  })

  it('returns false when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const succeeded = await checkForUpdate('0.1.0')

    expect(succeeded).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/updateCheck/updateCheck.test.ts`
Expected: the `isNewerVersion` tests still pass; the three new `checkForUpdate` tests FAIL on `expect(succeeded).toBe(true)`/`toBe(false)` because `checkForUpdate` currently returns `undefined` (its return type is `Promise<void>`).

- [ ] **Step 3: Change `checkForUpdate`'s return type**

In `src/main/updateCheck/updateCheck.ts`, replace the existing `checkForUpdate` function:

```typescript
// Runs once per app launch (called from main/index.ts's app.whenReady()) and
// on-demand from the renderer's manual "Check for Updates" button (via the
// app:checkForUpdate IPC channel). Both callers get the same best-effort
// behavior — this never throws — but only the manual path reads the
// returned boolean; the launch-time call ignores it and stays silent on
// failure by design (see main/index.ts).
export async function checkForUpdate(currentVersion: string): Promise<boolean> {
  const latestVersion = await fetchLatestVersion()
  if (!latestVersion) return false
  cachedStatus = {
    currentVersion,
    latestVersion,
    isNewer: isNewerVersion(latestVersion, currentVersion)
  }
  return true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/updateCheck/updateCheck.test.ts`
Expected: all tests (the 5 existing `isNewerVersion` ones plus the 3 new `checkForUpdate` ones) PASS.

- [ ] **Step 5: Confirm the launch-time call site still compiles unchanged**

Run: `npm run typecheck:node`
Expected: no errors. `checkForUpdate(app.getVersion()).catch(() => {})` in `src/main/index.ts` is valid whether the promise resolves `void` or `boolean` — no edit needed there. Leave that line's existing comment (`// Best-effort update check...`) as-is; Task 5 covers documentation.

- [ ] **Step 6: Commit**

```bash
git add src/main/updateCheck/updateCheck.ts src/main/updateCheck/updateCheck.test.ts
git commit -m "feat: checkForUpdate reports whether the fetch succeeded"
```

---

### Task 2: Shared `UpdateCheckResult` type

**Files:**
- Modify: `src/shared/types/entities.ts`

**Interfaces:**
- Produces: `UpdateCheckResult { status: UpdateStatus | null; succeeded: boolean }` — consumed by Task 3 (main handler + preload) and Task 4 (renderer hook).

- [ ] **Step 1: Add the type**

In `src/shared/types/entities.ts`, immediately after the existing `UpdateStatus` interface (currently the last thing in the file, ~line 436-440):

```typescript
// Result of an on-demand update check (app:checkForUpdate IPC channel).
// succeeded is false when the check itself failed (offline, bad response) —
// status may still be non-null in that case if an earlier check (e.g. the
// launch-time one) had already populated the cache.
export interface UpdateCheckResult {
  status: UpdateStatus | null
  succeeded: boolean
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: no errors (nothing consumes this type yet, so this just confirms the file still parses).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/entities.ts
git commit -m "feat: add UpdateCheckResult shared type"
```

---

### Task 3: `app:checkForUpdate` IPC channel (main + preload)

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Modify: `src/main/ipc/app.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `checkForUpdate(currentVersion: string): Promise<boolean>` and `getUpdateStatus(): UpdateStatus | null` from Task 1 (unchanged import already present in `app.ipc.ts`); `UpdateCheckResult` from Task 2.
- Produces: `window.api.app.checkForUpdate(): Promise<UpdateCheckResult>` — consumed by Task 4's renderer hook.

- [ ] **Step 1: Add the IPC channel name**

In `src/shared/types/ipc-contract.ts`, add a new line directly after `appGetUpdateStatus: 'app:getUpdateStatus',`:

```typescript
  appCheckForUpdate: 'app:checkForUpdate',
```

- [ ] **Step 2: Add the main-process handler**

In `src/main/ipc/app.ipc.ts`, add the import and handler:

```typescript
import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import { checkForUpdate, getUpdateStatus } from '../updateCheck/updateCheck'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
  safeHandle(IPC.appGetUpdateStatus, (): UpdateStatus | null => getUpdateStatus())

  // Unlike the launch-time check, this is a direct response to the user
  // clicking "Check for Updates" in Settings — its failure is worth
  // reporting back, so the boolean from checkForUpdate is passed through
  // instead of being swallowed.
  safeHandle(IPC.appCheckForUpdate, async (): Promise<UpdateCheckResult> => {
    const succeeded = await checkForUpdate(app.getVersion())
    return { status: getUpdateStatus(), succeeded }
  })
}
```

(This replaces the file's existing content — the two original lines stay, one import line and one new handler are added.)

- [ ] **Step 3: Expose it in preload**

In `src/preload/index.ts`, add `UpdateCheckResult` to the type-only import block (alongside the existing `UpdateStatus`, keeping the list alphabetical per the existing style) and add the method to the `app` object:

```typescript
  UpdateCheckResult,
```

```typescript
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    getUpdateStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke(IPC.appGetUpdateStatus),
    checkForUpdate: (): Promise<UpdateCheckResult> => ipcRenderer.invoke(IPC.appCheckForUpdate)
  },
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: no errors. (This codebase has no dedicated unit tests for IPC handlers themselves — `appGetVersion`/`appGetUpdateStatus` have none either — so typecheck plus Task 6's live verification is the coverage for this task, matching existing convention.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/app.ipc.ts src/preload/index.ts
git commit -m "feat: add app:checkForUpdate IPC channel"
```

---

### Task 4: `useCheckForUpdate()` renderer hook

**Files:**
- Modify: `src/renderer/src/state/queries/useApp.ts`

**Interfaces:**
- Consumes: `window.api.app.checkForUpdate(): Promise<UpdateCheckResult>` from Task 3.
- Produces: `useCheckForUpdate(): UseMutationResult<UpdateCheckResult, Error, void>`; `updateStatusQueryKey` (exported constant, replacing the inline array literal both `useUpdateCheck` and the new hook use) — consumed by Task 5's `AboutSection.tsx`.

- [ ] **Step 1: Replace the file's contents**

`src/renderer/src/state/queries/useApp.ts` currently has two query hooks with an inline `['app', 'updateStatus']` key. Replace the whole file:

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/state/queries/useApp.ts
git commit -m "feat: add useCheckForUpdate mutation hook"
```

---

### Task 5: "Check for Updates" button in `AboutSection`

**Files:**
- Modify: `src/renderer/src/components/settings/sections/AboutSection.tsx`

**Interfaces:**
- Consumes: `useUpdateCheck()` (existing), `useCheckForUpdate()` from Task 4.

- [ ] **Step 1: Replace the file's contents**

```typescript
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { useAppVersion, useCheckForUpdate, useUpdateCheck } from '@renderer/state/queries/useApp'

const RELEASES_URL = 'https://github.com/Elias-Brendon/Qoutation/releases'

export function AboutSection(): React.JSX.Element {
  const { data: version } = useAppVersion()
  const { data: status } = useUpdateCheck()
  const checkForUpdate = useCheckForUpdate()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">About</h3>
        <p className="mt-1 text-xs text-text-secondary">
          eQuotation{version ? ` v${version}` : ''}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkForUpdate.mutate()}
          disabled={checkForUpdate.isPending}
          className="w-fit"
        >
          {checkForUpdate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Check for Updates
        </Button>
        <UpdateStatusLine
          isPending={checkForUpdate.isPending}
          lastCheckSucceeded={checkForUpdate.data?.succeeded}
          status={status ?? null}
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
}

// Priority order matches the spec: a check in flight beats a stale error,
// which beats a stale success — always show the most current thing that's
// true, not the most alarming.
function UpdateStatusLine({
  isPending,
  lastCheckSucceeded,
  status
}: UpdateStatusLineProps): React.JSX.Element {
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
        Update available: v{status.latestVersion} —{' '}
        <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="underline">
          get it here
        </a>
      </p>
    )
  }

  if (status) {
    return <p className="text-xs text-text-muted">You&apos;re up to date.</p>
  }

  return <p className="text-xs text-text-muted">Not checked yet.</p>
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck:web && npm run lint`
Expected: no errors.

- [ ] **Step 3: Live-verify in the running app**

Run: `npm run dev`. Open Settings → About. Confirm:
- The version line and "Check for Updates" button render.
- Clicking the button shows the spinner, then settles into one of "Update available…", "You're up to date.", or the error line (the app's real Gist currently reports an older/equal version, so "You're up to date." is the expected happy-path result against the live Gist right now).
- If a newer version is reachable via the Gist, the TopBar pill also appears without navigating away from Settings first — confirms the shared-cache wiring from Task 4.
- Temporarily disconnect network (or block the Gist host) and click the button again: confirm the error line appears instead of a silent failure or a crash.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/settings/sections/AboutSection.tsx
git commit -m "feat: add manual check-for-updates UI to Settings About section"
```

---

### Task 6: Full test suite + `DEVELOPMENT.md` runbook expansion

**Files:**
- Modify: `DEVELOPMENT.md`

**Interfaces:**
- None — documentation only, no code interfaces produced or consumed.

- [ ] **Step 1: Run the full test suite**

Run: `npm test` (or the project's equivalent full-suite script — check `package.json`'s `"test"` entry if unsure)
Expected: all tests pass (104 existing + the 3 new `checkForUpdate` tests from Task 1 = 107).

- [ ] **Step 2: Expand `DEVELOPMENT.md`'s "Release workflow" section**

In `DEVELOPMENT.md`, replace the existing "## Release workflow" section (currently ~line 163-169, ending right before "## Where things live") with:

```markdown
## Release workflow

1. Land your changes on `master` with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, ...).
2. `npm run release` — bumps `package.json` version (plain semver, no prerelease suffix), regenerates `CHANGELOG.md`, commits, tags `vX.Y.Z`.
3. `git push --follow-tags`.
4. `npm run build:win` to produce the installer, then `npm run verify:installer` to confirm it actually installs/launches/uninstalls cleanly.
5. **Update the public version-check Gist** (`src/main/updateCheck/updateCheck.ts` has the URL in `LATEST_VERSION_GIST_URL`) to the new version — this is the step that actually makes the app-side "update available" notice appear. Nothing else in this workflow does that; skipping it means testers never hear about the release even though it's built and pushed.
6. Testers (added as read-only GitHub collaborators on this private repo) download the new installer from the repo's Releases page.

### How the app checks for updates (for debugging)

There is no `electron-updater`, no silent download, and nothing auto-installs — see `docs/superpowers/specs/2026-08-03-auto-update-design.md` for why. The whole mechanism is: fetch a version number from a Gist, compare it to `app.getVersion()`, and tell the user where to go get the new build themselves.

- **On launch**, `checkForUpdate()` (`src/main/updateCheck/updateCheck.ts`) fetches `LATEST_VERSION_GIST_URL`'s raw JSON (`{"latestVersion": "X.Y.Z"}`) and, if that succeeds, caches an `UpdateStatus` in main-process memory. This call is best-effort and swallows every failure silently (offline, Gist unreachable, malformed JSON) — it must never block or interrupt startup, so check `main/index.ts`'s `app.whenReady()` block if you need to confirm it's still being called, not `updateCheck.ts` itself, if the app seems to never notice new versions.
- **On demand**, clicking "Check for Updates" in Settings → About calls the same `checkForUpdate()` through the `app:checkForUpdate` IPC channel (`src/main/ipc/app.ipc.ts`), and — unlike the launch-time call — reports failure back to the UI instead of swallowing it.
- Both paths write to the same cache, read by `app:getUpdateStatus`. The renderer's `useUpdateCheck()` React Query hook (`src/renderer/src/state/queries/useApp.ts`) reads that cache and is what both the TopBar pill (`UpdateNotice` in `TopBar.tsx`) and the Settings About section render from — there's one cache and one query key (`updateStatusQueryKey`), not two independent checks to keep in sync.
- The TopBar pill additionally respects a per-version dismissal (`AppSettings.dismissedUpdateVersion`, persisted to `settings.json`) — dismissing "0.2.0 available" won't show that nag again, but "0.3.0 available" will. The Settings About section ignores dismissal entirely; it always shows the latest known check result.

**Debugging checklist:**
- **"The app never shows an update is available" / "Settings always says up to date":** first confirm the Gist itself was actually updated (step 5 above is the most commonly forgotten release step) — open `LATEST_VERSION_GIST_URL` directly in a browser or `curl` it and check the `latestVersion` value.
- **"Check for Updates spins forever or errors immediately":** almost certainly a network/DNS issue reaching `gist.githubusercontent.com`, or the Gist was made private/deleted — the JSON must be reachable unauthenticated.
- **"Update shows available but shouldn't, or vice versa":** check `isNewerVersion()`'s three-part numeric comparison (`updateCheck.ts`) against the actual `package.json` version and the Gist's value — it does not understand prerelease suffixes (`1.0.0-beta`), only plain `X.Y.Z`.
- **To force-test the "update available" UI locally** without waiting for a real release: temporarily lower the comparison in `isNewerVersion` (e.g. hardcode a return) or point `LATEST_VERSION_GIST_URL` at a scratch Gist with a higher `latestVersion` than your local build, then restart the app or click "Check for Updates". Revert before committing.
```

- [ ] **Step 3: Commit**

```bash
git add DEVELOPMENT.md
git commit -m "docs: expand release workflow with update-check debugging runbook"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 (main process boolean return) → Task 1. Component 2 (IPC channel) → Task 3. Component 3 (renderer hook) → Task 4. Component 4 (AboutSection UI, all 5 status states) → Task 5. Component 5 (tests) → Task 1 (updateCheck) + Task 6 (full suite). Documentation deliverable (code comments + DEVELOPMENT.md) → comments embedded in Tasks 1/3/4, DEVELOPMENT.md expansion in Task 6.
- **No dedicated IPC-handler/hook/component tests added** beyond `updateCheck.test.ts` — this matches the codebase's existing convention (confirmed: `appGetVersion`/`appGetUpdateStatus` have no handler tests, `AboutSection.tsx` and `useApp.ts` have no existing test files either), not an oversight. Coverage for that layer is typecheck + lint + Task 5's live verification, same as the rest of Settings.
- **Type consistency check:** `UpdateCheckResult` (Task 2) is used identically in Task 3's handler return type, Task 3's preload signature, and Task 4's mutation's `TData` generic. `updateStatusQueryKey` (Task 4) is the single source of truth both `useUpdateCheck` and `useCheckForUpdate`'s `setQueryData` call use — no risk of the two hooks silently drifting onto different array literals.
