import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Sld, UploadSldInput } from '@shared/types/entities'

export const sldsQueryKey = (projectId: string): readonly [string, string] => ['slds', projectId]

export function useSlds(projectId: string | null): UseQueryResult<Sld[]> {
  return useQuery({
    queryKey: sldsQueryKey(projectId ?? ''),
    queryFn: () => window.api.slds.listByProject(projectId as string),
    enabled: projectId !== null
  })
}

export function useUploadSld(): UseMutationResult<Sld | null, Error, UploadSldInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UploadSldInput) => window.api.slds.upload(input),
    onSuccess: (sld) => {
      if (sld) queryClient.invalidateQueries({ queryKey: sldsQueryKey(sld.projectId) })
    }
  })
}

export function useDeleteSld(): UseMutationResult<
  void,
  Error,
  { sldId: string; projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sldId }) => window.api.slds.delete(sldId),
    onSuccess: (_data, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: sldsQueryKey(projectId) })
  })
}
