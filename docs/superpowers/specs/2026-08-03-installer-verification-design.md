# Installer Verification — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** Beta-packaging initiative, sub-project 3 of 5 (see `project_remaining_stages_roadmap` memory). This absorbs the original roadmap item 5 / Stage 13's verify criterion: "installing on a clean profile and launching proves the native DB module rebuilt correctly and catalog loading works from a configured path." Sub-project 1 (legal & branding) already did a lightweight installer *build* validation (fixed a setup-icon mismatch) but did not verify install/launch/uninstall behavior. This sub-project does that.

## Goal

Prove the Windows NSIS installer this project produces actually installs, runs, and uninstalls cleanly on a real machine — not just that `electron-builder` completes without error.

## Deliverable

`scripts/verify-installer.ps1`, invoked via `npm run verify:installer`. A repeatable local script (mirrors the `npm run release` pattern from sub-project 2) that a beta build should pass before being handed to a tester.

**Platform scope:** Windows only. The project's active beta distribution target is Windows (NSIS); `electron-builder.yml` also lists `mac`/`linux` targets but there is no evidence they are used for beta distribution, and this machine can't verify them. Out of scope.

**Install mechanism:** silent CLI (`/S` flag), not GUI click-through. NSIS's `/S` flag drives install/uninstall with no dialogs, which is scriptable, reliable, and doesn't touch the user's real foreground desktop mid-run (past experience in this project: GUI desktop automation is flaky and disruptive on a real, actively-used desktop — see `feedback_shared_desktop_caution` memory). `electron-builder.yml`'s `nsis` config doesn't set `oneClick: false`, so the default is already a one-click, per-user installer (`%LOCALAPPDATA%\Programs\eQuotation`, no admin elevation needed) — `/S` just removes the one remaining progress dialog.

## Script Steps

1. **Pre-flight guard.** Check `%LOCALAPPDATA%\Programs\eQuotation` and `%APPDATA%\eqoutation` (the app's real userData dir — the runtime app name comes from `package.json`'s `"name": "eqoutation"`, not the `productName`/`eQuotation` used only for installer branding) do not already exist. If either does, abort with a clear error instead of silently uninstalling or overwriting real data. Confirmed clean on this machine as of 2026-08-03, but the guard protects future re-runs after a real beta install exists here.
2. **Build.** `npm run build:win` — always builds fresh from current code; this script doesn't accept a pre-built artifact, so a stale `dist/` can never produce a false pass.
3. **Silent install.** Locate `dist\eqoutation-*-setup.exe`, run it with `/S`, wait for completion.
4. **Install checks:**
   - Installed exe exists at `%LOCALAPPDATA%\Programs\eQuotation\eQuotation.exe`.
   - Start Menu shortcut exists (`shortcutName: eQuotation` per config).
   - Desktop shortcut exists (`createDesktopShortcut: always` per config).
   - An `HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\...` registry entry exists for the app (`appId: com.elias.equotation`).
   - Any check failing here stops the script and jumps to cleanup (step 6) before exiting non-zero.
5. **Launch + runtime checks:**
   - Start the installed exe as a background process (not `-Wait`).
   - Poll briefly, then confirm the process is still running — a crash here would mean `better-sqlite3` (the native module, historically the highest packaging risk per the original Stage 13 plan) failed to load in the packaged build.
   - Confirm `%APPDATA%\eqoutation\eqoutation.sqlite` was created.
   - Query that sqlite file directly — using the *repo's* `node_modules/better-sqlite3` (not the installed copy, since that's inside an asar/native module not meant to be invoked standalone) — and confirm the `schema_version` table has rows, proving migrations actually ran against a real packaged install, not just "the file exists."
   - Confirm `%APPDATA%\eqoutation\catalog` was created (the packaged-mode `defaultCatalogDir()` path). No functional catalog-loading check is performed: the app ships with no seed catalog data — catalogs are user-imported via Settings — so there is nothing to functionally exercise here beyond path creation.
6. **Teardown.** Stop the launched app process. Run the generated uninstaller (`Uninstall eQuotation.exe` or equivalent found in the install dir) with `/S`, wait for completion. This step always runs — wrapped in try/finally so a failure in steps 4–5 still triggers cleanup rather than leaving a half-verified install on the machine.
7. **Uninstall checks:**
   - Install directory removed.
   - Start Menu shortcut removed.
   - Desktop shortcut removed.
   - Registry uninstall entry removed.
   - `%APPDATA%\eqoutation` (userData/DB) is checked to confirm it **still exists** — standard Windows app behavior is to leave user data behind on uninstall, so this is reported as expected/informational, not a failure.
8. **Result.** Print a PASS/FAIL summary line per check, plus an overall summary. Exit code 0 if every check passed, non-zero otherwise (useful for a human running it manually before a release; no CI exists to consume this yet).

## npm script

Add `"verify:installer": "powershell -ExecutionPolicy Bypass -File scripts/verify-installer.ps1"` to `package.json`.

## Out of scope

- macOS/Linux installer verification (no target platform available on this machine, not the active beta distribution channel).
- GUI wizard click-through / visual verification of installer dialog text or branding (deliberately replaced with silent `/S` per the mechanism decision above; sub-project 1 already verified installer/app icons visually).
- Functional catalog-loading verification (no seed catalog ships with the app to test against).
- CI integration (no CI pipeline exists yet in this project).
