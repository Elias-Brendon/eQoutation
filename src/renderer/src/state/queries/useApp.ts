import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export const updateStatusQueryKey = ['app', 'updateStatus'] as const

export function useAppVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => window.api.app.getVersion(),
    staleTime: Infinity
  })
}

export function useUpdateCheck(): UseQueryResult<UpdateStatus | null> {
  return useQuery({
    queryKey: updateStatusQueryKey,
    queryFn: () => window.api.app.getUpdateStatus(),
    staleTime: Infinity
  })
}

// Triggers a fresh update check (distinct from useUpdateCheck's read of the
// once-per-launch cached result). Writes straight into updateStatusQueryKey
// via setQueryData rather than invalidateQueries — the mutation's own fetch
// already refreshed the main-process cache, so a refetch here would just
// re-read the same value with an extra IPC round trip. This is also what
// makes the TopBar's update pill (which reads the same query key) reflect a
// manual check with no extra wiring.
export function useCheckForUpdate(): UseMutationResult<UpdateCheckResult, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.app.checkForUpdate(),
    onSuccess: (result) => {
      queryClient.setQueryData(updateStatusQueryKey, result.status)
    }
  })
}
