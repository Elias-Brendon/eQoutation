import { ipcMain } from 'electron'
import { createSld, listSldsByProject } from '../db/repositories/sldsRepo'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateSldInput } from '@shared/types/entities'

export function registerSldsIpc(): void {
  ipcMain.handle(IPC.sldsListByProject, (_event, projectId: string) => listSldsByProject(projectId))
  ipcMain.handle(IPC.sldsCreate, (_event, input: CreateSldInput) => createSld(input))
}
