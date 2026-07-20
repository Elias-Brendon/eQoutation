import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Flag, FlagOriginCounts, RaiseFlagInput } from '@shared/types/entities'

export const flagsQueryKey = (quotationId: string): readonly [string, string] => [
  'flags',
  quotationId
]
export const openFlagCountsQueryKey = (projectId: string): readonly [string, string] => [
  'flagCounts',
  projectId
]

export function useFlagsByQuotation(quotationId: string | null): UseQueryResult<Flag[]> {
  return useQuery({
    queryKey: flagsQueryKey(quotationId ?? ''),
    queryFn: () => window.api.flags.listByQuotation(quotationId as string),
    enabled: quotationId !== null
  })
}

export function useOpenFlagCountsByProject(
  projectId: string | null
): UseQueryResult<FlagOriginCounts> {
  return useQuery({
    queryKey: openFlagCountsQueryKey(projectId ?? ''),
    queryFn: () => window.api.flags.countOpenByProject(projectId as string),
    enabled: projectId !== null
  })
}

export function useRaiseFlag(): UseMutationResult<
  Flag,
  Error,
  RaiseFlagInput & { projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables) =>
      window.api.flags.raise({
        quotationId: variables.quotationId,
        quotationLineId: variables.quotationLineId,
        severity: variables.severity,
        message: variables.message,
        pageNumber: variables.pageNumber
      }),
    onSuccess: (flag, variables) => {
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(flag.quotationId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(variables.projectId) })
    }
  })
}

export function useResolveFlag(): UseMutationResult<
  void,
  Error,
  { id: string; resolutionNote?: string; quotationId: string; projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolutionNote }) => window.api.flags.resolve(id, resolutionNote),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(variables.quotationId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(variables.projectId) })
    }
  })
}
