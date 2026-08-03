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
