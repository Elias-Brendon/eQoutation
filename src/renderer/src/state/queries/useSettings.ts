import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { AppSettings, PickCatalogDirResult } from '@shared/types/entities'

export const settingsQueryKey = ['settings'] as const

export function useSettings(): UseQueryResult<AppSettings> {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => window.api.settings.get()
  })
}

export function useUpdateSettings(): UseMutationResult<AppSettings, Error, Partial<AppSettings>> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch) => window.api.settings.update(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsQueryKey })
  })
}

export function usePickCatalogDir(): UseMutationResult<PickCatalogDirResult | null, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.settings.pickCatalogDir(),
    onSuccess: (result) => {
      if (!result) return
      queryClient.invalidateQueries({ queryKey: settingsQueryKey })
      queryClient.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}
