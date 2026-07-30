import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  CatalogItem,
  Flag,
  FlagOriginCounts,
  NewCatalogItemInput,
  RaiseFlagInput,
  ResolveUnmatchedLineResult
} from '@shared/types/entities'

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
  {
    id: string
    resolutionNote?: string
    outcome?: { action: 'accepted' | 'corrected'; value: string }
    quotationId: string
    projectId: string
  }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolutionNote, outcome }) =>
      window.api.flags.resolve(id, resolutionNote, outcome),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(variables.quotationId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(variables.projectId) })
    }
  })
}

interface CatalogResolveContext {
  // Null when the resolve flow is opened directly on a line (e.g. a
  // double-click) rather than via an open flag — in that case only the
  // line gets re-matched, no flag gets resolved.
  flagId: string | null
  quotationId: string
  sldId: string
  projectId: string
}

function invalidateAfterCatalogResolve(
  queryClient: ReturnType<typeof useQueryClient>,
  ctx: CatalogResolveContext
): void {
  queryClient.invalidateQueries({ queryKey: flagsQueryKey(ctx.quotationId) })
  queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(ctx.projectId) })
  queryClient.invalidateQueries({ queryKey: ['quotation', ctx.sldId] })
}

export function useResolveUnmatchedLine(): UseMutationResult<
  ResolveUnmatchedLineResult,
  Error,
  CatalogResolveContext & { flagId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ flagId }) => window.api.flags.resolveUnmatchedLine(flagId),
    onSuccess: (result, variables) => {
      if (result.matched) invalidateAfterCatalogResolve(queryClient, variables)
    }
  })
}

export function useLinkLineToCatalogItem(): UseMutationResult<
  void,
  Error,
  CatalogResolveContext & { lineId: string; catalogItemId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ flagId, lineId, catalogItemId }) =>
      window.api.flags.linkLineToCatalogItem(flagId, lineId, catalogItemId),
    onSuccess: (_data, variables) => invalidateAfterCatalogResolve(queryClient, variables)
  })
}

export function useAddCatalogItemAndLink(): UseMutationResult<
  CatalogItem,
  Error,
  CatalogResolveContext & { lineId: string; input: NewCatalogItemInput }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ flagId, lineId, input }) =>
      window.api.flags.addCatalogItemAndLink(flagId, lineId, input),
    onSuccess: (_data, variables) => {
      invalidateAfterCatalogResolve(queryClient, variables)
      queryClient.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}
