import { app, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { listEvents } from '../db/repositories/eventLogRepo'
import type { EventLogEntry } from '@shared/types/entities'

export interface DiagnosticBundle {
  systemInfo: {
    appVersion: string
    electronVersion: string
    osPlatform: string
    osVersion: string
    arch: string
    totalMemoryBytes: number
  }
  events: EventLogEntry[]
}

export function buildDiagnosticBundle(): DiagnosticBundle {
  return {
    systemInfo: {
      // `app` is unavailable under ELECTRON_RUN_AS_NODE (the dbtest runner) -
      // real packaged/dev runs always have it, per the existing app:getVersion
      // IPC handler (src/main/ipc/app.ipc.ts) using the same call.
      appVersion: app ? app.getVersion() : 'unknown',
      electronVersion: process.versions.electron ?? 'unknown',
      osPlatform: process.platform,
      osVersion: os.release(),
      arch: process.arch,
      totalMemoryBytes: os.totalmem()
    },
    events: listEvents()
  }
}

export async function exportDiagnosticBundle(): Promise<string | null> {
  const dateStamp = new Date().toISOString().slice(0, 10)

  const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
  const result = await dialog.showSaveDialog(focusedWindow as BrowserWindow, {
    title: 'Export diagnostic bundle',
    defaultPath: join(app.getPath('downloads'), `diagnostic-bundle-${dateStamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null

  writeFileSync(result.filePath, JSON.stringify(buildDiagnosticBundle(), null, 2), 'utf-8')
  return result.filePath
}
