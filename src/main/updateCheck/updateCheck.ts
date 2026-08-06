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

export function getUpdateStatus(): UpdateStatus | null {
  return cachedStatus
}
