import { ipcMain } from 'electron'
import {
  createProject,
  listProjects,
  updateProjectCurrency
} from '../db/repositories/projectsRepo'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateProjectInput, Project } from '@shared/types/entities'

export function registerProjectsIpc(): void {
  ipcMain.handle(IPC.projectsList, () => listProjects())
  ipcMain.handle(IPC.projectsCreate, (_event, input: CreateProjectInput) => createProject(input))
  ipcMain.handle(
    IPC.projectsUpdateCurrency,
    (_event, projectId: string, currency: string): Project =>
      updateProjectCurrency(projectId, currency)
  )
}
