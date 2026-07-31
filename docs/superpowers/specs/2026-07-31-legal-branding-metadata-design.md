# Legal & Branding Metadata — Design Spec

**Date:** 2026-07-31
**Status:** Approved

## Problem

The app is about to go to beta users outside the developer's own machine, but currently has no license, no copyright notice, no author metadata beyond a bare `"Elias"` string, and no in-app disclosure of what data leaves the machine (SLD PDFs go to Anthropic's Claude API; currency lookups go to Frankfurter's public API). Beta testers need at minimum: who owns this software, what it does with their data, and an acknowledgment that it's beta-quality.

## Scope

This is sub-project 1 of a 5-part beta-packaging initiative (order agreed with the user): legal/branding metadata → version system & path audit → installer verification → observability → auto-update. This spec covers only the first: license, copyright, author metadata, and an in-app disclosure panel. No formal EULA acceptance gate, no separate Privacy Policy/Terms of Use documents — the user explicitly chose the lighter-weight "short in-app disclosure + LICENSE file" option over full formal documents, appropriate for a small trusted beta group.

## Decisions

- **License**: Proprietary / All Rights Reserved. Not open source — no MIT/Apache-style permissive grant.
- **Author/copyright entity**: "Elias Brendon" (matches the GitHub account `Elias-Brendon` already used for this repo).
- **Policy content**: a single "Beta Software" + "Data Handling" disclosure, shown in Settings, not a launch-time gate. Content:
  - Beta disclaimer: this is beta software, expect bugs, don't rely on it for production-critical work without a backup.
  - Data handling: SLD PDFs uploaded are sent to Anthropic's Claude API for component extraction; currency conversion queries Frankfurter's public API; all project data is otherwise stored locally; nothing is sent to the developer or any other third party.
  - Copyright line.

## Architecture

- **`package.json`**: set `"author": "Elias Brendon"` (currently `"Elias"`) and add `"license": "UNLICENSED"` (the standard npm-ecosystem convention for proprietary software — also causes `npm publish` to refuse, a useful guardrail even though this project isn't published to npm).
- **New `LICENSE` file** at the repo root: standard proprietary all-rights-reserved text, copyright holder "Elias Brendon", copyright year 2026.
- **`electron-builder.yml`**: add a top-level `copyright: "Copyright © 2026 Elias Brendon"` key. electron-builder passes this through to the Windows NSIS installer's file version info and uninstall registry entry (visible in "Apps & Features" and the installed `.exe`'s file properties).
- **New `app:getVersion` IPC channel** (`src/main/ipc/app.ipc.ts`, `registerAppIpc()`, following the existing one-file-per-domain pattern in `src/main/ipc/`): a single handler returning Electron's `app.getVersion()` (which reads `package.json`'s `version` field automatically — no new state to maintain). Registered in `src/main/ipc/index.ts` alongside the other `register*Ipc()` calls. Exposed in preload as `window.api.app.getVersion(): Promise<string>`.
  - This is deliberately minimal — it exists so the About panel has a version to display today. Sub-project 2 ("version system") owns anything beyond this single read (build metadata, displaying version elsewhere, version-comparison logic for auto-update, etc.) — no need to build more here.
- **New `AboutSection.tsx`** (`src/renderer/src/components/settings/sections/AboutSection.tsx`), added as the last entry in `SettingsPage.tsx`'s `NAV_ITEMS`/`SectionId` union, following the exact structural pattern of the existing sections (e.g. `FontSizeSection.tsx` for a simple example — a `useQuery`-backed value plus static content, no mutations needed here since nothing is editable). Renders:
  1. App name + version (`eQuotation v{version}`, version fetched via a new `useAppVersion()` hook in `src/renderer/src/state/queries/useApp.ts` wrapping the new IPC).
  2. "Beta Software" notice (static text, per Decisions above).
  3. "Data Handling" disclosure (static bulleted text, per Decisions above).
  4. Copyright line: `© 2026 Elias Brendon. All rights reserved.` (static text, matches the LICENSE file).

## Error handling

None needed — this is entirely static content plus one trivial read-only IPC call with no failure modes worth handling beyond React Query's default (if the version fetch fails, the panel just doesn't show a version number; nothing else in the app depends on it).

## Testing

No automated tests — this sub-project is pure static content and a single-line IPC wrapper with no logic branches to exercise (consistent with how trivial glue code elsewhere in this codebase, e.g. `getCatalogDir()`, isn't separately unit-tested). Manual/live verification: open Settings > About, confirm the version number matches `package.json`, confirm all four content blocks render, confirm the LICENSE file exists at the repo root with the correct holder name, confirm `electron-builder.yml`'s copyright field is present.
