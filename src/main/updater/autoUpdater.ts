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

// checkForUpdates() is verified (electron-updater 6.8.9's AppUpdater.js) to
// both emit 'error' and reject its returned promise on failure, so a plain
// try/catch is sufficient — no need to also race an 'error' listener.
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

// Unlike checkForUpdate, this is allowed to reject naturally — the
// app:downloadUpdate IPC handler awaits it directly, and safeHandle turns a
// rejection into an error the renderer's mutation can react to.
export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}
