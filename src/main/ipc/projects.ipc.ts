import { getCurrentUserId } from '../auth/authState'
import { getUserById } from '../db/repositories/usersRepo'
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProjectAiModelOverride,
  updateProjectCurrencySettings,
  updateProjectDetails
} from '../db/repositories/projectsRepo'
import { deleteProjectFiles } from '../storage/projectStorage'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type {
  CreateProjectInput,
  Project,
  UpdateProjectAiModelOverrideInput,
  UpdateProjectCurrencySettingsInput,
  UpdateProjectDetailsInput
} from '@shared/types/entities'

function currentUsername(): string | null {
  const userId = getCurrentUserId()
  return userId ? (getUserById(userId)?.username ?? null) : null
}

export function registerProjectsIpc(): void {
  safeHandle(IPC.projectsList, () => listProjects())
  safeHandle(
    IPC.projectsCreate,
    (_event, input: CreateProjectInput): Project => createProject(input, currentUsername())
  )
  safeHandle(
    IPC.projectsUpdateCurrencySettings,
    (_event, input: UpdateProjectCurrencySettingsInput): Project =>
      updateProjectCurrencySettings(input.projectId, {
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        exchangeRateIsManual: input.exchangeRateIsManual
      })
  )
  safeHandle(
    IPC.projectsUpdateAiModelOverride,
    (_event, input: UpdateProjectAiModelOverrideInput): Project =>
      updateProjectAiModelOverride(input.projectId, input.aiModelOverride)
  )
  safeHandle(
    IPC.projectsUpdateDetails,
    (_event, input: UpdateProjectDetailsInput): Project =>
      updateProjectDetails(input.projectId, {
        name: input.name,
        sector: input.sector,
        company: input.company,
        coordinator: input.coordinator,
        status: input.status
      })
  )
  safeHandle(IPC.projectsDelete, (_event, projectId: string): void => {
    const project = getProjectById(projectId)
    if (!project) throw new AppError('DB_PROJECT_NOT_FOUND')
    deleteProjectFiles(projectId)
    deleteProject(projectId)
  })
}
