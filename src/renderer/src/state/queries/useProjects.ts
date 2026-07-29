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
  UpdateProjectCurrencySettingsInput
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
