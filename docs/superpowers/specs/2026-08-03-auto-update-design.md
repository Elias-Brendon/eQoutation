# Auto-update — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** Beta-packaging initiative, sub-project 5 of 5 (final) — see `project_remaining_stages_roadmap` memory. Sub-projects 1–4 (branding, version system, installer verification, observability) are complete. The original plan's open risk list flagged "Auto-update — not designed; `electron-updater` + release feed would be a separate later decision" — this sub-project makes that decision.

## Scope decision

Full `electron-updater` silent background auto-update was considered and rejected for this project's actual situation: the repo (`Elias-Brendon/Qoutation`) is private, and `electron-updater`'s GitHub provider needs releases to be either publicly downloadable or accessed with an embedded token — shipping a credential with the app is a real security liability (a leaked token grants read access to the private source repo), and making the repo public would expose proprietary source code (the app is licensed `UNLICENSED`/proprietary per sub-project 1's `LICENSE`).

Given a handful of known beta testers (confirmed with the user), the proportionate design is a **lightweight version check-and-notify**: the app tells a tester a newer build exists and links them to where they can get it; it never downloads or installs anything itself. This trades full automation for zero new infrastructure, zero embedded credentials, and no change to the repo's privacy.

## Components

### 1. Version-check source: a public Gist (user-created, manual)

A tiny public GitHub Gist containing only:

```json
{ "latestVersion": "0.1.0" }
```

Created and hand-edited by the user after each release (one more step added to the existing `npm run release` → `npm run build:win` → `npm run verify:installer` workflow from sub-project 2). Public and unauthenticated to read — no source code or private repo content is exposed, only a version string. The user provides the raw-content URL, which gets hardcoded into the app (not user-configurable — there's exactly one correct value, matching how e.g. `appId` is hardcoded in `electron-builder.yml`).

### 2. Download delivery: existing private repo, testers as GitHub collaborators

Testers are added as read-only collaborators on the private repo (a manual GitHub administration step, not application code) and download new installers from the repo's Releases page, logged into their own GitHub account. This reuses the release process sub-project 2 already built — no new artifact hosting.

### 3. Update check (main process)

New `src/main/updateCheck/updateCheck.ts`:
- `fetchLatestVersion(): Promise<string | null>` — fetches the Gist's raw JSON via `fetch`, parses `latestVersion`. Any failure (network error, malformed JSON, non-200 response) returns `null` — this must never throw and never block app startup, matching the existing best-effort pattern already used for daily FX-rate refresh in `main/index.ts` (`refreshStaleProjectExchangeRates().catch(() => {})`).
- `isNewerVersion(latest: string, current: string): boolean` — simple three-part numeric comparison (`major.minor.patch`). No semver library needed: this project only ever produces plain `X.Y.Z` versions with no prerelease suffixes, a decision already made in sub-project 2.

Called once per app launch from `main/index.ts`'s `app.whenReady().then(...)`, alongside the existing FX-refresh call — same best-effort, non-blocking treatment.

### 4. IPC + renderer

- New IPC channel `updateCheck:getStatus`, returning `{ currentVersion: string; latestVersion: string; isNewer: boolean } | null` (null if the check hasn't completed yet or failed) to the renderer.
- New `useUpdateCheck()` React Query hook, polling this once on mount (`staleTime: Infinity`, matching the existing `useAppVersion` hook's pattern — this is app-lifetime-static data, not something that needs refetching mid-session).

### 5. TopBar notice

A small dismissible banner in the existing `TopBar` component: "Version X.Y.Z is available" with a link that calls `shell.openExternal('https://github.com/Elias-Brendon/Qoutation/releases')` (a hardcoded URL — there's exactly one releases page). Only rendered when `isNewer` is true and the current version hasn't already been dismissed.

Dismissal persists across restarts: a new nullable `dismissedUpdateVersion` field in `settings.json` (mirrors the existing `AppSettings` shape and `updateSettings()` pattern from `settingsStore.ts`). Dismissing sets it to the currently-available `latestVersion`; the banner re-appears only once a *newer* version than the dismissed one is published — a tester who dismisses "0.2.0 available" won't see that nag again, but will see "0.3.0 available" once it exists.

## Out of scope

- Silent background download/install of any kind.
- Code-signing infrastructure for verifying auto-downloaded update packages (irrelevant since nothing is auto-downloaded).
- Embedding any GitHub token or other credential in the app.
- Making the repository or its releases publicly accessible.
- Release-notes/changelog display inside the app — the link goes to the general GitHub Releases listing, not a specific tag or changelog view (`CHANGELOG.md` from sub-project 2 stays a local file, not surfaced in-app).
- Rate-limiting or caching the version check beyond "once per app launch" — Gist raw-content reads are unauthenticated and have generous limits; a per-launch check for a handful of testers is negligible load.
