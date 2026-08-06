import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@shared/types/entities'
import { DEFAULT_COMPONENT_TYPES } from '@shared/constants/componentTypes'
import { DEFAULT_AI_MODEL } from '@shared/constants/aiModels'

// process.cwd() only means "this project's catalog/ folder" while running
// under electron-vite in dev — in a packaged build it's unpredictable (often
// the install directory), so that default would silently point nowhere.
// Packaged builds default to a per-user folder under userData instead.
function defaultCatalogDir(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'catalog')
  }
  return join(process.cwd(), 'catalog')
}

function defaultSettings(): AppSettings {
  return {
    catalogDir: defaultCatalogDir(),
    preferredBrands: [],
    preferredBrandsByType: {},
    enabledComponentTypes: DEFAULT_COMPONENT_TYPES,
    projectSectors: [
      'Data Centre',
      'Industrial',
      'Infrastructure',
      'Renewable Energy',
      'Semiconductor'
    ],
    companies: [],
    customExtractionRules: [],
    aiModel: DEFAULT_AI_MODEL,
    aiProvider: 'anthropic',
    openaiCompatibleBaseUrl: '',
    openaiCompatibleModel: '',
    // Real extraction data shows the model's self-reported confidence
    // clustering between 0.3-0.7 even for correct reads — 0.7 flagged ~88%
    // of lines for review, drowning the signal. 0.5 is a more realistic
    // out-of-the-box default; still user-adjustable in Settings > AI Model.
    confidenceThreshold: 0.5,
    maxExtractionRetries: 0,
    defaultMargin: 1.35,
    fontScale: 'md',
    annotationFontSize: 12,
    dismissedUpdateVersion: null,
    cachedAiModels: null,
    lastActiveProjectId: null
  }
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  const filePath = settingsFilePath()
  const defaults = defaultSettings()
  if (!existsSync(filePath)) return defaults

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      catalogDir: parsed.catalogDir ?? defaults.catalogDir,
      preferredBrands: parsed.preferredBrands ?? defaults.preferredBrands,
      preferredBrandsByType: parsed.preferredBrandsByType ?? defaults.preferredBrandsByType,
      enabledComponentTypes: parsed.enabledComponentTypes ?? defaults.enabledComponentTypes,
      projectSectors: parsed.projectSectors ?? defaults.projectSectors,
      companies: parsed.companies ?? defaults.companies,
      customExtractionRules: parsed.customExtractionRules ?? defaults.customExtractionRules,
      aiModel: parsed.aiModel ?? defaults.aiModel,
      aiProvider: parsed.aiProvider ?? defaults.aiProvider,
      openaiCompatibleBaseUrl: parsed.openaiCompatibleBaseUrl ?? defaults.openaiCompatibleBaseUrl,
      openaiCompatibleModel: parsed.openaiCompatibleModel ?? defaults.openaiCompatibleModel,
      confidenceThreshold: parsed.confidenceThreshold ?? defaults.confidenceThreshold,
      maxExtractionRetries: parsed.maxExtractionRetries ?? defaults.maxExtractionRetries,
      defaultMargin: parsed.defaultMargin ?? defaults.defaultMargin,
      fontScale: parsed.fontScale ?? defaults.fontScale,
      annotationFontSize: parsed.annotationFontSize ?? defaults.annotationFontSize,
      dismissedUpdateVersion: parsed.dismissedUpdateVersion ?? defaults.dismissedUpdateVersion,
      cachedAiModels: parsed.cachedAiModels ?? defaults.cachedAiModels,
      lastActiveProjectId: parsed.lastActiveProjectId ?? defaults.lastActiveProjectId
    }
  } catch {
    return defaults
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  const filePath = settingsFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function getCatalogDir(): string {
  return getSettings().catalogDir
}

export function setCatalogDir(catalogDir: string): void {
  updateSettings({ catalogDir })
}
