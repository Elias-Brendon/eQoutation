import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { CatalogItem, CatalogReloadResult, CatalogStatus } from '@shared/types/entities'

const catalogStatusKey = ['catalog', 'status'] as const

export function useCatalogStatus(): UseQueryResult<CatalogStatus> {
  return useQuery({
    queryKey: catalogStatusKey,
    queryFn: () => window.api.catalog.getStatus()
  })
}

export function useReloadCatalog(): UseMutationResult<CatalogReloadResult, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.catalog.reload(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogStatusKey })
  })
}

export function useCatalogSearch(query: string, enabled: boolean): UseQueryResult<CatalogItem[]> {
  return useQuery({
    queryKey: ['catalog', 'search', query],
    queryFn: () => window.api.catalog.search(query, 100),
    enabled
  })
}
