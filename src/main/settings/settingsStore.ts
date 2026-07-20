import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface Settings {
  catalogDir: string
}

// Dev-only default: this project's own catalog/ folder. Once a real Settings
// screen exists (planned — see appDescription), this becomes user-configurable
// and should no longer assume the app is running from the project directory.
function defaultCatalogDir(): string {
  return join(process.cwd(), 'catalog')
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function readSettings(): Settings {
  const filePath = settingsFilePath()
  if (!existsSync(filePath)) {
    return { catalogDir: defaultCatalogDir() }
  }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { catalogDir: parsed.catalogDir ?? defaultCatalogDir() }
  } catch {
    return { catalogDir: defaultCatalogDir() }
  }
}

function writeSettings(settings: Settings): void {
  const filePath = settingsFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getCatalogDir(): string {
  return readSettings().catalogDir
}

export function setCatalogDir(catalogDir: string): void {
  writeSettings({ ...readSettings(), catalogDir })
}
