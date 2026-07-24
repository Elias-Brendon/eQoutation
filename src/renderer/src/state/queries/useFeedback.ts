import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { FeedbackLogEntry, FeedbackResolveLineInput, QuotationLine } from '@shared/types/entities'
import { quotationQueryKey } from './useQuotation'
import { flagsQueryKey, openFlagCountsQueryKey } from './useFlags'

const feedbackQueryKey = (lineId: string): readonly [string, string] => ['feedback', lineId]

export function useFeedbackByLine(lineId: string | null): UseQueryResult<FeedbackLogEntry[]> {
  return useQuery({
    queryKey: feedbackQueryKey(lineId ?? ''),
    queryFn: () => window.api.feedback.listByLine(lineId as string),
    enabled: lineId !== null
  })
}

interface ResolveFeedbackContext {
  sldId: string
  quotationId: string
  projectId: string
}

export function useResolveFeedback(): UseMutationResult<
  QuotationLine,
  Error,
  FeedbackResolveLineInput & ResolveFeedbackContext
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.feedback.resolveLine(input),
    onSuccess: (_line, variables) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(variables.sldId) })
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(variables.quotationId) })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: feedbackQueryKey(variables.lineId) })
    }
  })
}
