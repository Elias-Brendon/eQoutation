import { ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { getCatalogStatus, reloadCatalog } from '../catalog/catalogLoader'
import { listDistinctMakers, searchCatalogItems } from '../db/repositories/catalogRepo'
import { IPC } from '@shared/types/ipc-contract'

export function registerCatalogIpc(): void {
  ipcMain.handle(IPC.catalogGetStatus, () => getCatalogStatus())
  ipcMain.handle(IPC.catalogReload, () => reloadCatalog())
  ipcMain.handle(IPC.catalogSearch, (_event, query: string, limit?: number) =>
    searchCatalogItems(query, limit)
  )
  ipcMain.handle(IPC.catalogListDistinctMakers, (): string[] => listDistinctMakers())
  ipcMain.handle(IPC.catalogOpenFolder, (): void => {
    const { catalogDir } = getCatalogStatus()
    if (!existsSync(catalogDir)) mkdirSync(catalogDir, { recursive: true })
    shell.openPath(catalogDir)
  })
}
