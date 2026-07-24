import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { TestApiKeyResult } from '@shared/types/entities'

const apiKeyMaskedQueryKey = ['secrets', 'apiKeyMasked'] as const

export function useApiKeyMasked(): UseQueryResult<string | null> {
  return useQuery({
    queryKey: apiKeyMaskedQueryKey,
    queryFn: () => window.api.secrets.getApiKeyMasked()
  })
}

export function useSetApiKey(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key) => window.api.secrets.setApiKey(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeyMaskedQueryKey })
  })
}

export function useTestApiKey(): UseMutationResult<TestApiKeyResult, Error, string> {
  return useMutation({
    mutationFn: (key) => window.api.secrets.testApiKey(key)
  })
}
