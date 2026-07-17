import { ipcMain } from 'electron'
import { createProject, listProjects } from '../db/repositories/projectsRepo'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateProjectInput } from '@shared/types/entities'

export function registerProjectsIpc(): void {
  ipcMain.handle(IPC.projectsList, () => listProjects())
  ipcMain.handle(IPC.projectsCreate, (_event, input: CreateProjectInput) => createProject(input))
}
