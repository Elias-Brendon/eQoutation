import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { CreateSldInput, Sld } from '@shared/types/entities'

export const sldsQueryKey = (projectId: string): readonly [string, string] => ['slds', projectId]

export function useSlds(projectId: string | null): UseQueryResult<Sld[]> {
  return useQuery({
    queryKey: sldsQueryKey(projectId ?? ''),
    queryFn: () => window.api.slds.listByProject(projectId as string),
    enabled: projectId !== null
  })
}

export function useCreateSld(): UseMutationResult<Sld, Error, CreateSldInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSldInput) => window.api.slds.create(input),
    onSuccess: (sld) => queryClient.invalidateQueries({ queryKey: sldsQueryKey(sld.projectId) })
  })
}
