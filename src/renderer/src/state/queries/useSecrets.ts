import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { SecretKeyName, TestApiKeyResult } from '@shared/types/entities'

const apiKeyMaskedQueryKey = (keyName: SecretKeyName): readonly [string, string, SecretKeyName] =>
  ['secrets', 'apiKeyMasked', keyName] as const

export function useApiKeyMasked(keyName: SecretKeyName): UseQueryResult<string | null> {
  return useQuery({
    queryKey: apiKeyMaskedQueryKey(keyName),
    queryFn: () => window.api.secrets.getApiKeyMasked(keyName)
  })
}

export function useSetApiKey(keyName: SecretKeyName): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key) => window.api.secrets.setApiKey(keyName, key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeyMaskedQueryKey(keyName) })
  })
}

export function useTestApiKey(keyName: SecretKeyName): UseMutationResult<TestApiKeyResult, Error, string> {
  return useMutation({
    mutationFn: (key) => window.api.secrets.testApiKey(keyName, key)
  })
}

export function useDeleteApiKey(keyName: SecretKeyName): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.secrets.deleteApiKey(keyName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeyMaskedQueryKey(keyName) })
  })
}
