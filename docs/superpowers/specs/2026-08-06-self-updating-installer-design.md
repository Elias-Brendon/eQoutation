# Self-Updating Installer via electron-updater — Design

**Date:** 2026-08-06
**Status:** Approved
**Context:** Supersedes `docs/superpowers/specs/2026-08-03-auto-update-design.md` and `docs/superpowers/specs/2026-08-06-manual-update-check-design.md`. Both are kept as historical record (not edited) — this spec replaces the mechanism they built, not just extends it. The user wants the app to download and install a new version itself once they confirm, rather than opening the GitHub Releases page in a browser.

**Real gap found while scoping this:** `gh release list --repo Elias-Brendon/Qoutation` returns nothing — only git tags (`v0.1.0`, `v0.1.1`) exist. No GitHub Release has ever actually been published with an attached installer. `DEVELOPMENT.md`'s claim that "testers download the new installer from the Releases page" was aspirational, not functioning. This work fixes that as a prerequisite, since self-update needs real published releases to update *from*.

## Scope decision

Full `electron-updater`, replacing the Gist-based check entirely (per the user's explicit choice, having weighed hand-rolling a custom downloader against reusing a solved, tested mechanism). This requires the private-repo tradeoff the earlier spec deliberately avoided: `electron-updater`'s GitHub provider needs authenticated access to fetch private release metadata and assets. The user chose to accept this — **making the whole repo public was explicitly rejected** in favor of embedding a narrowly-scoped, revocable, read-only fine-grained GitHub token in the app.

**Stated risk, not hidden:** anyone who extracts this token from the packaged app (the compiled JS bundle is not meaningfully obfuscated) gains read access to the private source repo. Mitigations: the token is fine-grained (GitHub's newer token type, not a classic PAT), scoped to **Contents: Read-only on this one repository only** — no access to any other repo, no write access, no account-level capability — and can be revoked/rotated instantly from GitHub's UI if it ever leaks, at the cost of breaking self-update for installed apps until the next manual release.

Windows-only, matching the rest of this project's current scope (no mac/linux builds exist today).

## Components

### 1. Runtime token — a one-time manual prerequisite

**You create this yourself** via GitHub → Settings → Developer settings → Fine-grained personal access tokens: scope to the `Qoutation` repository only, permission `Contents: Read-only`, no other permissions. This is an interactive, account-level action outside what an agent should do on your behalf — the same category as adding beta testers as collaborators was in the original design.

The token is supplied at build time via a gitignored `.env` file's `MAIN_VITE_UPDATE_TOKEN` variable — electron-vite's built-in convention (already used implicitly by this project's tooling) statically compiles any `MAIN_VITE_`-prefixed env var into the main-process bundle as `import.meta.env.MAIN_VITE_UPDATE_TOKEN`, readable at runtime with no extra `electron.vite.config.ts` changes. `.env.example` gets a new commented line documenting it. This is a **different mechanism** from the project's existing `loadEnv()` call in `main/index.ts` (that one is explicitly dev-only, reading `.env` at *runtime* from the working directory, which doesn't exist in a packaged app) — worth flagging in code comments so a future reader doesn't conflate the two.

### 2. `electron-builder.yml` — real GitHub publishing

The current `publish` block is unused boilerplate (`provider: generic`, `url: https://example.com/auto-updates` — never pointed at anything real). Replaced with:

```yaml
publish:
  provider: github
  owner: Elias-Brendon
  repo: Qoutation
  private: true
```

This is what makes `latest.yml` (the metadata file `electron-updater` reads to know the current published version and asset URL) get generated and uploaded alongside the installer.

### 3. New release-publish script

`package.json` gains `"build:win:publish": "npm run build && electron-builder --win --publish always"`, separate from the existing `build:win` (which stays local-build-only — `verify-installer.ps1` calls `build:win` and must never accidentally publish a real release on every verification run). Publishing requires the *developer's own* GitHub token with `repo` scope available as `GH_TOKEN` in the shell running the command (e.g. `gh auth token`) — this is electron-builder's own publish-time credential, separate from and never overlapping with the app's embedded runtime token from Component 1.

### 4. `src/main/updater/autoUpdater.ts` (new — replaces `src/main/updateCheck/` entirely)

`src/main/updateCheck/updateCheck.ts` and its test file are deleted; `isNewerVersion`'s manual three-part version comparison is no longer needed, since `electron-updater` fires distinct `update-available` / `update-not-available` events itself.

```typescript
import { autoUpdater } from 'electron-updater'
import type { WebContents } from 'electron'
import type { UpdateStatus, UpdateCheckResult } from '@shared/types/entities'

let cachedStatus: UpdateStatus | null = null

// Compiled in at build time via electron-vite's MAIN_VITE_ env convention —
// see .env.example. Empty in dev/local builds, which makes every check fail
// closed (401 from GitHub) rather than throw; matches this app's existing
// "update checks are always best-effort" posture.
const UPDATE_TOKEN = import.meta.env.MAIN_VITE_UPDATE_TOKEN ?? ''

export function initAutoUpdater(webContents: WebContents): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.requestHeaders = { authorization: `token ${UPDATE_TOKEN}` }

  autoUpdater.on('update-available', (info) => {
    cachedStatus = { currentVersion: autoUpdater.currentVersion.version, latestVersion: info.version, isNewer: true }
  })
  autoUpdater.on('update-not-available', (info) => {
    cachedStatus = { currentVersion: autoUpdater.currentVersion.version, latestVersion: info.version, isNewer: false }
  })
  autoUpdater.on('download-progress', (progress) => {
    webContents.send('app:updateDownloadProgress', Math.round(progress.percent))
  })
  // Single confirmation covers the whole action (per design decision) — once
  // the download finishes, install and relaunch immediately, no second
  // "restart now" click.
  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall()
  })
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err)
  })
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    await autoUpdater.checkForUpdates()
    return { status: cachedStatus, succeeded: true }
  } catch (error) {
    console.error('[autoUpdater] check failed', error)
    return { status: cachedStatus, succeeded: false }
  }
}

export function getUpdateStatus(): UpdateStatus | null {
  return cachedStatus
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((error) => console.error('[autoUpdater] download failed', error))
}
```

(Exact code finalized during planning — this establishes the interfaces later tasks depend on: `initAutoUpdater`, `checkForUpdate`, `getUpdateStatus`, `downloadUpdate`.)

### 5. `main/index.ts` wiring

`createWindow()` returns the `BrowserWindow` (currently a function returning `void`); `app.whenReady()` captures it and calls `initAutoUpdater(mainWindow.webContents)` — the same "pass webContents into a setup function" pattern already used for `registerWindowCrashHandlers(mainWindow.webContents)`. The existing best-effort launch-time check line becomes `checkForUpdate().catch(() => {})`, calling the new module instead of the old one — same call site, same silent-failure posture.

### 6. IPC — one new channel, two reused

`app:getUpdateStatus` and `app:checkForUpdate` keep their existing channel names and payload shapes (`UpdateStatus | null`, `UpdateCheckResult`) — their handlers just call into the new module instead of the old one, so the renderer's `useUpdateCheck()`/`useCheckForUpdate()` hooks need no changes at all. New: `app:downloadUpdate` (invoke, `Promise<void>`, calls the new module's `downloadUpdate()`) and a push channel `app:updateDownloadProgress` (main → renderer, `number` percent, 0-100), following the exact preload pattern already used for `ai:extractionProgress`/`window.api.ai.onProgress`.

### 7. Renderer — confirm, download, progress

New `useDownloadUpdate()` mutation (`useApp.ts`, same shape as `useCheckForUpdate()`) and a small `useUpdateDownloadProgress(): number | null` hook that subscribes to the new push channel via `useEffect` — used independently by both consuming components (Electron's `ipcRenderer.on` supports multiple listeners on one channel, so no shared global store is needed the way `extractionProgress` needed `useUiStore`, since this is only consumed in exactly two places).

Both `TopBar`'s `UpdateNotice` and `AboutSection` change their "update available" affordance from a plain link to a button: click → `window.confirm('Update to vX.Y.Z? The app will download the update and restart automatically.')` (matching the existing delete-project confirm pattern) → confirmed → `useDownloadUpdate().mutate()` → the pill/status line switches to "Downloading update… NN%" driven by `useUpdateDownloadProgress()` → app quits and relaunches on its own once the main process's `update-downloaded` handler fires (no further renderer action). A download-time `error` event (network drop mid-download) needs its own UI state — "Update failed to download — try again" — distinct from the existing "couldn't check for updates" state, surfaced the same way the manual-check failure already is.

### 8. Documentation

`DEVELOPMENT.md`'s "Release workflow" / "How the app checks for updates" sections (written twice already this session for the Gist mechanism) get rewritten for the real mechanism: the one-time token setup, the new publish step, how to test a real self-update end-to-end (needs two actually-published versions — a live, manual, two-machine-or-two-install test, not something a unit test can cover), and a debugging checklist for the new failure modes (expired/revoked token → 401 on check; no `latest.yml` published → "no update available" even though a newer tag exists; download failures).

## Out of scope

- macOS/Linux self-update (no builds exist for those platforms today).
- CI/GitHub Actions automation of the publish step — it stays a manual command the developer runs locally, matching this project's existing release workflow philosophy (no CI infrastructure exists anywhere in this repo).
- A second "restart now" confirmation after download — explicitly decided against.
- Silent background pre-downloading before the user confirms — explicitly decided against (`autoDownload = false`).
- Rotating/managing the embedded token automatically, or any server-side token-issuing backend — this project has no backend; the token is a static, manually-rotated credential, by design.
