# Installer Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `scripts/verify-installer.ps1` (run via `npm run verify:installer`) that proves the Windows NSIS installer actually installs, launches, and uninstalls cleanly on a real machine, then run it for real on this machine and confirm it passes.

**Architecture:** A single PowerShell script, since NSIS's silent-install/uninstall flags (`/S`) and the checks involved (registry, shortcuts, `%LOCALAPPDATA%`/`%APPDATA%`) are all Windows-native concepts with no cross-platform equivalent needed here. The script builds fresh, installs silently, checks install artifacts, launches the installed app and checks it stays alive + its DB migrated, then always (via try/catch/finally) tears down via the silent uninstaller and checks cleanup, printing a PASS/FAIL summary with a matching exit code. There is no unit-testable logic to TDD here — the script's only meaningful "test" is running it for real against a real install, which is Task 2.

**Tech Stack:** PowerShell 5.1 (Windows built-in), npm scripts, `node` + the repo's own `node_modules/better-sqlite3` (to query the installed app's DB file directly), electron-builder's NSIS output.

## Global Constraints

- Windows only — no macOS/Linux verification. Source: spec "Platform scope."
- Silent CLI install/uninstall via `/S`, never GUI click-through. Source: spec "Install mechanism."
- The script must always build fresh via `npm run build:win` — never accept a pre-built `dist/` artifact, so a stale build can't produce a false pass. Source: spec step 2.
- Pre-flight guard: abort before touching anything if `%LOCALAPPDATA%\Programs\eQuotation` or `%APPDATA%\eqoutation` already exist. Source: spec step 1.
- The installed app must never be launched against the real `%APPDATA%\eqoutation` — that path holds this machine's actual dev data. Launch with Electron's `--user-data-dir=<isolated temp dir>` switch instead, and check that the isolated dir survives uninstall (proving the uninstaller doesn't delete userData at any path), then delete it as the script's own final housekeeping. Source: spec step 1 and step 7 (corrected 2026-08-03, found while executing this plan).
- No catalog-directory or `settings.json` check — both are created lazily on explicit user action, not on a bare launch, so there's nothing to observe from launch alone. Source: spec step 5 (corrected 2026-08-03).
- Teardown (stop process, run uninstaller, check cleanup) must run even if earlier checks fail — wrap in try/catch/finally, not a bare try that lets exceptions escape uncaught. Source: spec step 6, "Safety."

---

### Task 1: Write the verification script and wire the npm command

**Files:**
- Create: `scripts/verify-installer.ps1`
- Modify: `package.json` (add `"verify:installer"` script)

**Interfaces:**
- Produces: `npm run verify:installer`, consumed by Task 2 (the real end-to-end run).

- [ ] **Step 1: Write `scripts/verify-installer.ps1`**

```powershell
#Requires -Version 5.1
<#
Verifies the Windows NSIS installer: builds fresh, installs silently,
checks the installed app launches and its DB migrates, uninstalls
silently, and checks cleanup. Exits non-zero on any failed check.
#>

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\eQuotation'
$UserDataDir = Join-Path $env:APPDATA 'eqoutation'
$StartMenuShortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\eQuotation.lnk'
$DesktopShortcut = Join-Path $env:USERPROFILE 'Desktop\eQuotation.lnk'
$InstalledExe = Join-Path $InstallDir 'eQuotation.exe'
$DbPath = Join-Path $UserDataDir 'eqoutation.sqlite'

$script:Failures = @()
$script:AppProcess = $null

function Test-Check {
    param([string]$Name, [bool]$Condition)
    if ($Condition) {
        Write-Host "  [PASS] $Name" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $Name" -ForegroundColor Red
        $script:Failures += $Name
    }
}

function Get-UninstallRegistryEntry {
    $root = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    if (-not (Test-Path $root)) { return $null }
    $match = Get-ChildItem $root | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath
        if ($props.DisplayName -eq 'eQuotation') { $props }
    } | Select-Object -First 1
    return $match
}

Write-Host "=== Pre-flight guard ===" -ForegroundColor Cyan
if (Test-Path $InstallDir) {
    throw "Install dir already exists at $InstallDir - aborting to avoid touching a real install. Remove it manually first if this is intentional."
}
if (Test-Path $UserDataDir) {
    throw "User data dir already exists at $UserDataDir - aborting to avoid touching real app data. Remove it manually first if this is intentional."
}
Write-Host "  Clean - no existing install or user data found."

try {
    Write-Host "`n=== Build ===" -ForegroundColor Cyan
    npm run build:win
    if ($LASTEXITCODE -ne 0) { throw "npm run build:win failed with exit code $LASTEXITCODE" }

    $Setup = Get-ChildItem 'dist' -Filter 'eqoutation-*-setup.exe' | Select-Object -First 1
    if (-not $Setup) { throw "No setup exe found in dist/ after build" }
    Write-Host "  Built $($Setup.Name)"

    Write-Host "`n=== Silent install ===" -ForegroundColor Cyan
    Start-Process -FilePath $Setup.FullName -ArgumentList '/S' -Wait
    Start-Sleep -Seconds 2

    Write-Host "`n=== Install checks ===" -ForegroundColor Cyan
    Test-Check "Installed exe exists" (Test-Path $InstalledExe)
    Test-Check "Start Menu shortcut exists" (Test-Path $StartMenuShortcut)
    Test-Check "Desktop shortcut exists" (Test-Path $DesktopShortcut)
    $regEntry = Get-UninstallRegistryEntry
    Test-Check "Registry uninstall entry exists" ($null -ne $regEntry)

    if ($script:Failures.Count -gt 0) {
        throw "Install checks failed: $($script:Failures -join ', ')"
    }

    Write-Host "`n=== Launch + runtime checks ===" -ForegroundColor Cyan
    $script:AppProcess = Start-Process -FilePath $InstalledExe -PassThru
    Start-Sleep -Seconds 8

    $stillRunning = $false
    try {
        Get-Process -Id $script:AppProcess.Id -ErrorAction Stop | Out-Null
        $stillRunning = $true
    } catch {
        $stillRunning = $false
    }
    Test-Check "App process still running after launch" $stillRunning
    Test-Check "Sqlite DB file created" (Test-Path $DbPath)

    if (Test-Path $DbPath) {
        $schemaCount = node -e "const Database = require('better-sqlite3'); const db = new Database(process.argv[1], { readonly: true }); const row = db.prepare('SELECT COUNT(*) as c FROM schema_version').get(); console.log(row.c); db.close();" "$DbPath"
        Test-Check "schema_version has migration rows" ([int]$schemaCount -gt 0)
    } else {
        Test-Check "schema_version has migration rows" $false
    }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    $script:Failures += "Exception: $_"
} finally {
    Write-Host "`n=== Teardown ===" -ForegroundColor Cyan
    if ($script:AppProcess -and -not $script:AppProcess.HasExited) {
        Stop-Process -Id $script:AppProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  Stopped app process."
    }

    if (Test-Path $InstallDir) {
        $Uninstaller = Get-ChildItem $InstallDir -Filter 'Uninstall*.exe' | Select-Object -First 1
        if ($Uninstaller) {
            Start-Process -FilePath $Uninstaller.FullName -ArgumentList '/S' -Wait
            Start-Sleep -Seconds 2
        } else {
            Write-Host "  WARNING: no uninstaller found in $InstallDir - manual cleanup required." -ForegroundColor Yellow
        }
    }

    Write-Host "`n=== Uninstall checks ===" -ForegroundColor Cyan
    Test-Check "Install dir removed" (-not (Test-Path $InstallDir))
    Test-Check "Start Menu shortcut removed" (-not (Test-Path $StartMenuShortcut))
    Test-Check "Desktop shortcut removed" (-not (Test-Path $DesktopShortcut))
    Test-Check "Registry uninstall entry removed" ($null -eq (Get-UninstallRegistryEntry))

    if (Test-Path $UserDataDir) {
        Write-Host "  [INFO] User data at $UserDataDir survived uninstall - expected Windows app behavior, not a failure." -ForegroundColor Yellow
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($script:Failures.Count -eq 0) {
    Write-Host "PASS - all checks passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAIL - $($script:Failures.Count) check(s) failed: $($script:Failures -join ', ')" -ForegroundColor Red
    exit 1
}
```

- [ ] **Step 2: Syntax-check the script without running it**

Run:
```bash
powershell -NoProfile -Command "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/verify-installer.ps1'), [ref]$null, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Host $_ }; exit 1 } else { Write-Host 'OK: no syntax errors' }"
```
Expected: `OK: no syntax errors`. This only parses the file — it does not execute any install/uninstall logic, so it's safe to run repeatedly while iterating on the script. If it reports errors, fix them before proceeding to Task 2 (do not attempt to run a script with known syntax errors against a real install).

- [ ] **Step 3: Add the npm script**

In `package.json`, add this entry to `"scripts"` (alongside `"release"`):

```json
"verify:installer": "powershell -ExecutionPolicy Bypass -File scripts/verify-installer.ps1",
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-installer.ps1 package.json
git commit -m "chore: add installer verification script"
```

---

### Task 2: Run the verification for real and confirm it passes

**Files:**
- Modify: `scripts/verify-installer.ps1` (only if Task 1's version has bugs discovered by actually running it — expected risk given this drives real Windows install/uninstall APIs that can't be meaningfully unit-tested beforehand)

**Interfaces:**
- Consumes: `npm run verify:installer` from Task 1.

- [ ] **Step 1: Run the full verification**

```bash
npm run verify:installer
```

Expected: the script prints `=== Pre-flight guard ===` through `=== Summary ===`, ending in `PASS - all checks passed.` with exit code 0. This is a real install: it will briefly create a Start Menu shortcut, a Desktop shortcut, a registry entry, and an installed copy of the app under `%LOCALAPPDATA%\Programs\eQuotation`, then remove all of them via the uninstaller before finishing — expected and by design, not a bug.

- [ ] **Step 2: If any check fails, diagnose and fix**

Read the `[FAIL]` lines and the `ERROR:` line (if the script threw) to identify which assumption was wrong — for example, the install directory name, shortcut filename, or the registry `DisplayName` value could differ from what Task 1 assumed if electron-builder's actual NSIS output doesn't match the documented default. Confirm the actual value by inspecting the filesystem/registry directly, e.g.:

```bash
powershell -NoProfile -Command "Get-ChildItem \"$env:LOCALAPPDATA\Programs\" | Select-Object Name"
powershell -NoProfile -Command "Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like '*Quotation*' } | Select-Object DisplayName, PSChildName"
```

Fix `scripts/verify-installer.ps1` to match reality, then re-run Step 1. Repeat until it passes.

Note: because the pre-flight guard aborts if `$InstallDir` or `$UserDataDir` already exist, a run that fails and leaves either behind (e.g., the script errored before teardown could complete due to a bug outside the try/catch/finally structure) will block the next run. If that happens, manually verify what's left is only this verification's own leftover (not pre-existing real data — already confirmed clean before Task 1 started) before removing it and re-running:

```bash
powershell -NoProfile -Command "Remove-Item -Recurse -Force \"$env:LOCALAPPDATA\Programs\eQuotation\" -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force \"$env:APPDATA\eqoutation\" -ErrorAction SilentlyContinue"
```

- [ ] **Step 3: Commit any fixes made to the script**

Only if Step 2 required changes:

```bash
git add scripts/verify-installer.ps1
git commit -m "fix: correct installer verification assumptions found by a real run"
```

If Step 1 passed clean on the first try, there is nothing to commit in this task.
