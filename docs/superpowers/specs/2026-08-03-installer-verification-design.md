# Installer Verification — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** Beta-packaging initiative, sub-project 3 of 5 (see `project_remaining_stages_roadmap` memory). This absorbs the original roadmap item 5 / Stage 13's verify criterion: "installing on a clean profile and launching proves the native DB module rebuilt correctly and catalog loading works from a configured path." Sub-project 1 (legal & branding) already did a lightweight installer *build* validation (fixed a setup-icon mismatch) but did not verify install/launch/uninstall behavior. This sub-project does that.

## Goal

Prove the Windows NSIS installer this project produces actually installs, runs, and uninstalls cleanly on a real machine — not just that `electron-builder` completes without error.

## Deliverable

`scripts/verify-installer.ps1`, invoked via `npm run verify:installer`. A repeatable local script (mirrors the `npm run release` pattern from sub-project 2) that a beta build should pass before being handed to a tester.

**Platform scope:** Windows only. The project's active beta distribution target is Windows (NSIS); `electron-builder.yml` also lists `mac`/`linux` targets but there is no evidence they are used for beta distribution, and this machine can't verify them. Out of scope.

**Install mechanism:** silent CLI (`/S` flag), not GUI click-through. NSIS's `/S` flag drives install/uninstall with no dialogs, which is scriptable, reliable, and doesn't touch the user's real foreground desktop mid-run (past experience in this project: GUI desktop automation is flaky and disruptive on a real, actively-used desktop — see `feedback_shared_desktop_caution` memory). `electron-builder.yml`'s `nsis` config doesn't set `oneClick: false`, so the default is already a one-click, per-user installer (`%LOCALAPPDATA%\Programs\eqoutation`, no admin elevation needed) — `/S` just removes the one remaining progress dialog.

## Script Steps

1. **Pre-flight guard.** Check `%LOCALAPPDATA%\Programs\eqoutation` does not already exist; abort with a clear error if it does, instead of silently reinstalling over a real install. **Correction (2026-08-03, found while executing the plan):** the app's real userData dir at `%APPDATA%\eqoutation` already contains this machine's actual dev data (`eqoutation.sqlite`, `settings.json`, `secrets.json`, a `projects` folder, real Chromium profile caches) — an earlier ad-hoc check that reported this path as empty was wrong (a shell-escaping mistake evaluated a bogus path, not the real one). The script must never point the installed app at that real path. Instead it launches the installed app with Electron's `--user-data-dir=<isolated temp dir>` switch (a standard Electron/Chromium flag), fully redirecting where it stores everything — DB, settings, cache — to a synthetic, script-owned directory that is safe to create, inspect, and delete freely. The pre-flight guard removes any leftover copy of that isolated directory from a previous failed run (safe, since the script exclusively owns it) but still hard-aborts if the real Program Files-equivalent install dir exists.
2. **Build.** `npm run build:win` — always builds fresh from current code; this script doesn't accept a pre-built artifact, so a stale `dist/` can never produce a false pass.
3. **Silent install.** Locate `dist\eqoutation-*-setup.exe`, run it with `/S`, wait for completion.
4. **Install checks:**
   - Installed exe exists at `%LOCALAPPDATA%\Programs\eqoutation\eQuotation.exe`. **Correction (2026-08-03):** the one-click installer's default per-user install folder name comes from `package.json`'s `"name"` field (`eqoutation`, lowercase), not the `productName`/`eQuotation` used for the executable filename, shortcuts, and registry display name — an earlier version of this doc assumed the folder was also `eQuotation`, which a real run disproved.
   - Start Menu shortcut exists (`shortcutName: eQuotation` per config).
   - Desktop shortcut exists (`createDesktopShortcut: always` per config).
   - An `HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\...` registry entry exists for the app (`appId: com.elias.equotation`).
   - Any check failing here stops the script and jumps to cleanup (step 6) before exiting non-zero.
5. **Launch + runtime checks:**
   - Start the installed exe as a background process (not `-Wait`), passing `--user-data-dir=<isolated temp dir>` so it never touches the real `%APPDATA%\eqoutation`.
   - Poll briefly, then confirm the process is still running — a crash here would mean `better-sqlite3` (the native module, historically the highest packaging risk per the original Stage 13 plan) failed to load in the packaged build.
   - Confirm `<isolated temp dir>\eqoutation.sqlite` was created.
   - Query that sqlite file directly — using the *repo's* `node_modules/better-sqlite3` (not the installed copy, since that's inside an asar/native module not meant to be invoked standalone) — and confirm the `schema_version` table has rows, proving migrations actually ran against a real packaged install, not just "the file exists." **Correction (2026-08-03):** the repo's `better-sqlite3` binary is rebuilt against Electron's Node ABI (via `electron-builder install-app-deps`), so plain system `node` cannot load it (`NODE_MODULE_VERSION` mismatch). The query must run through the repo's own `electron` binary in Node-compat mode (`ELECTRON_RUN_AS_NODE=1`), the same technique the existing `test:db` npm script already uses for the same reason.
   - No catalog-directory or `settings.json` check is performed: both `defaultCatalogDir()`'s directory and `settings.json` are created lazily, only on explicit user action (opening the catalog folder, changing a setting) — not on a bare launch — so there is nothing to observe from launch alone. The DB file check above is what actually proves `app.getPath('userData')` path resolution works end-to-end in the packaged build.
6. **Teardown.** Stop the launched app process. Run the generated uninstaller (`Uninstall eQuotation.exe` or equivalent found in the install dir) with `/S`, wait for completion. This step always runs — wrapped in try/catch/finally so a failure in steps 4–5 still triggers cleanup rather than leaving a half-verified install on the machine.
7. **Uninstall checks:**
   - Install directory removed.
   - Start Menu shortcut removed.
   - Desktop shortcut removed.
   - Registry uninstall entry removed.
   - The isolated temp userData dir is checked to confirm it **still exists** after the uninstaller runs — this proves the NSIS uninstaller only removes the install directory/shortcuts/registry entry and never deletes userData at any path, which is the same behavioral guarantee that protects the real `%APPDATA%\eqoutation` on an actual user's machine. Reported as expected/informational, not a failure.
   - The script then deletes the isolated temp userData dir itself as final housekeeping (its own cleanup, distinct from what the uninstaller does/doesn't do) — this is script bookkeeping, not a verification check.
8. **Result.** Print a PASS/FAIL summary line per check, plus an overall summary. Exit code 0 if every check passed, non-zero otherwise (useful for a human running it manually before a release; no CI exists to consume this yet).

## npm script

Add `"verify:installer": "powershell -ExecutionPolicy Bypass -File scripts/verify-installer.ps1"` to `package.json`.

## Out of scope

- macOS/Linux installer verification (no target platform available on this machine, not the active beta distribution channel).
- GUI wizard click-through / visual verification of installer dialog text or branding (deliberately replaced with silent `/S` per the mechanism decision above; sub-project 1 already verified installer/app icons visually).
- Functional catalog-loading verification (no seed catalog ships with the app to test against).
- CI integration (no CI pipeline exists yet in this project).
