import { BrowserWindow, dialog } from 'electron'
import { getSettings, updateSettings } from '../settings/settingsStore'
import { reloadCatalog } from '../catalog/catalogLoader'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { AppSettings, PickCatalogDirResult } from '@shared/types/entities'

export function registerSettingsIpc(): void {
  safeHandle(IPC.settingsGet, (): AppSettings => getSettings())

  safeHandle(IPC.settingsUpdate, (_event, patch: Partial<AppSettings>): AppSettings =>
    updateSettings(patch)
  )

  safeHandle(IPC.settingsPickCatalogDir, async (): Promise<PickCatalogDirResult | null> => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await dialog.showOpenDialog(focusedWindow as BrowserWindow, {
      title: 'Select the folder containing your catalog .xlsx file',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const settings = updateSettings({ catalogDir: result.filePaths[0] })
    const reload = await reloadCatalog()
    return { settings, reload }
  })
}
