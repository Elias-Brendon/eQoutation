import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export function useSldFile(sldId: string | null): UseQueryResult<Uint8Array> {
  return useQuery({
    queryKey: ['sldFile', sldId ?? ''],
    queryFn: () => window.api.slds.readFile(sldId as string),
    enabled: sldId !== null,
    staleTime: Infinity
  })
}
