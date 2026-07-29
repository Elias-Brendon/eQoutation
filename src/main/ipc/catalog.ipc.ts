import { shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { getCatalogStatus, reloadCatalog } from '../catalog/catalogLoader'
import { listDistinctMakers, searchCatalogItems } from '../db/repositories/catalogRepo'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'

export function registerCatalogIpc(): void {
  safeHandle(IPC.catalogGetStatus, () => getCatalogStatus())
  safeHandle(IPC.catalogReload, () => reloadCatalog())
  safeHandle(IPC.catalogSearch, (_event, query: string, limit?: number) =>
    searchCatalogItems(query, limit)
  )
  safeHandle(IPC.catalogListDistinctMakers, (): string[] => listDistinctMakers())
  safeHandle(IPC.catalogOpenFolder, (): void => {
    const { catalogDir } = getCatalogStatus()
    if (!existsSync(catalogDir)) mkdirSync(catalogDir, { recursive: true })
    shell.openPath(catalogDir)
  })
}
