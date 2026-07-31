import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  CreateProjectInput,
  Project,
  UpdateProjectAiModelOverrideInput,
  UpdateProjectCurrencySettingsInput,
  UpdateProjectDetailsInput
} from '@shared/types/entities'

export const projectsQueryKey = ['projects'] as const

export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: () => window.api.projects.list()
  })
}

export function useCreateProject(): UseMutationResult<Project, Error, CreateProjectInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectInput) => window.api.projects.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  })
}

export function useUpdateProjectCurrencySettings(): UseMutationResult<
  Project,
  Error,
  UpdateProjectCurrencySettingsInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.projects.updateCurrencySettings(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  })
}

export function useUpdateProjectAiModelOverride(): UseMutationResult<
  Project,
  Error,
  UpdateProjectAiModelOverrideInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProjectAiModelOverrideInput) =>
      window.api.projects.updateAiModelOverride(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  })
}

export function useUpdateProjectDetails(): UseMutationResult<
  Project,
  Error,
  UpdateProjectDetailsInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProjectDetailsInput) => window.api.projects.updateDetails(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  })
}
