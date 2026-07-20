import { ipcMain } from 'electron'
import { getCatalogStatus, reloadCatalog } from '../catalog/catalogLoader'
import { searchCatalogItems } from '../db/repositories/catalogRepo'
import { IPC } from '@shared/types/ipc-contract'

export function registerCatalogIpc(): void {
  ipcMain.handle(IPC.catalogGetStatus, () => getCatalogStatus())
  ipcMain.handle(IPC.catalogReload, () => reloadCatalog())
  ipcMain.handle(IPC.catalogSearch, (_event, query: string, limit?: number) =>
    searchCatalogItems(query, limit)
  )
}
