import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Extraction } from '@shared/types/entities'

const extractionQueryKey = (sldId: string): readonly [string, string] => ['extraction', sldId]

export function useExtraction(sldId: string | null): UseQueryResult<Extraction | null> {
  return useQuery({
    queryKey: extractionQueryKey(sldId ?? ''),
    queryFn: () => window.api.ai.getExtraction(sldId as string),
    enabled: sldId !== null
  })
}

export interface ExtractSldInput {
  sldId: string
  force?: boolean
}

export function useExtractSld(): UseMutationResult<Extraction, Error, ExtractSldInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sldId, force }: ExtractSldInput) => window.api.ai.extractSld(sldId, { force }),
    onSuccess: (extraction) => {
      queryClient.setQueryData(extractionQueryKey(extraction.sldId), extraction)
    },
    // The main process persists a failed extraction row before rethrowing —
    // refetch so the panel picks up the error state instead of staying blank.
    onError: (_error, { sldId }) => {
      queryClient.invalidateQueries({ queryKey: extractionQueryKey(sldId) })
    }
  })
}
