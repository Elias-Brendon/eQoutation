import {
  createProject,
  listProjects,
  updateProjectCurrencySettings
} from '../db/repositories/projectsRepo'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateProjectInput, Project, UpdateProjectCurrencySettingsInput } from '@shared/types/entities'

export function registerProjectsIpc(): void {
  safeHandle(IPC.projectsList, () => listProjects())
  safeHandle(IPC.projectsCreate, (_event, input: CreateProjectInput) => createProject(input))
  safeHandle(
    IPC.projectsUpdateCurrencySettings,
    (_event, input: UpdateProjectCurrencySettingsInput): Project =>
      updateProjectCurrencySettings(input.projectId, {
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        exchangeRateIsManual: input.exchangeRateIsManual
      })
  )
}
