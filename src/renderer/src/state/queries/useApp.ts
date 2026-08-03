import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { UpdateStatus } from '@shared/types/entities'

export function useAppVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => window.api.app.getVersion(),
    staleTime: Infinity
  })
}

export function useUpdateCheck(): UseQueryResult<UpdateStatus | null> {
  return useQuery({
    queryKey: ['app', 'updateStatus'],
    queryFn: () => window.api.app.getUpdateStatus(),
    staleTime: Infinity
  })
}
