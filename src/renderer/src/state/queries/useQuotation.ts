import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Quotation, QuotationComment } from '@shared/types/entities'
import { sldsQueryKey } from './useSlds'
import { flagsQueryKey, openFlagCountsQueryKey } from './useFlags'

export const quotationQueryKey = (sldId: string): readonly [string, string] => [
  'quotation',
  sldId
]
const projectQuotationsQueryKey = (projectId: string): readonly [string, string] => [
  'quotations',
  projectId
]
const quotationCommentsQueryKey = (quotationId: string): readonly [string, string] => [
  'quotationComments',
  quotationId
]

export function useQuotation(sldId: string | null): UseQueryResult<Quotation | null> {
  return useQuery({
    queryKey: quotationQueryKey(sldId ?? ''),
    queryFn: () => window.api.quotations.getBySld(sldId as string),
    enabled: sldId !== null
  })
}

export function useQuotationsByProject(projectId: string | null): UseQueryResult<Quotation[]> {
  return useQuery({
    queryKey: projectQuotationsQueryKey(projectId ?? ''),
    queryFn: () => window.api.quotations.listByProject(projectId as string),
    enabled: projectId !== null
  })
}

export function useGenerateQuotation(): UseMutationResult<Quotation, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sldId: string) => window.api.quotations.generate(sldId),
    onSuccess: (quotation) => {
      queryClient.setQueryData(quotationQueryKey(quotation.sldId), quotation)
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['flagCounts'] })
      queryClient.invalidateQueries({ queryKey: flagsQueryKey(quotation.id) })
    }
  })
}

export function useExportQuotation(): UseMutationResult<
  Quotation,
  Error,
  { quotationId: string; sldId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId }) => window.api.quotations.export(quotationId),
    onSuccess: (quotation, { sldId }) => {
      queryClient.setQueryData(quotationQueryKey(sldId), quotation)
    }
  })
}

interface QuotationReviewVariables {
  quotationId: string
  sldId: string
  projectId: string
  comment?: string
}

function invalidateAfterReview(
  queryClient: ReturnType<typeof useQueryClient>,
  quotation: Quotation,
  variables: QuotationReviewVariables
): void {
  queryClient.setQueryData(quotationQueryKey(variables.sldId), quotation)
  queryClient.invalidateQueries({ queryKey: ['quotations'] })
  queryClient.invalidateQueries({ queryKey: sldsQueryKey(variables.projectId) })
}

export function useApproveQuotation(): UseMutationResult<
  Quotation,
  Error,
  QuotationReviewVariables
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, comment }) => window.api.quotations.approve(quotationId, comment),
    onSuccess: (quotation, variables) => invalidateAfterReview(queryClient, quotation, variables)
  })
}

export function useRejectQuotation(): UseMutationResult<
  Quotation,
  Error,
  QuotationReviewVariables
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, comment }) => window.api.quotations.reject(quotationId, comment),
    onSuccess: (quotation, variables) => invalidateAfterReview(queryClient, quotation, variables)
  })
}

export function useQuotationComments(
  quotationId: string | null
): UseQueryResult<QuotationComment[]> {
  return useQuery({
    queryKey: quotationCommentsQueryKey(quotationId ?? ''),
    queryFn: () => window.api.quotations.listComments(quotationId as string),
    enabled: quotationId !== null
  })
}

export function useAddQuotationComment(): UseMutationResult<
  QuotationComment,
  Error,
  { quotationId: string; body: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, body }) => window.api.quotations.addComment(quotationId, body),
    onSuccess: (_comment, { quotationId }) => {
      queryClient.invalidateQueries({ queryKey: quotationCommentsQueryKey(quotationId) })
    }
  })
}

export function useUpdateLineMargin(): UseMutationResult<
  void,
  Error,
  { lineId: string; margin: number; sldId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, margin }) => window.api.quotations.updateLineMargin(lineId, margin),
    onSuccess: (_data, { sldId }) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
    }
  })
}

export function useUpdatePanelMargin(): UseMutationResult<
  void,
  Error,
  { quotationId: string; panelName: string; margin: number; sldId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, panelName, margin }) =>
      window.api.quotations.updatePanelMargin(quotationId, panelName, margin),
    onSuccess: (_data, { sldId }) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
    }
  })
}

export function useDeleteQuotation(): UseMutationResult<
  void,
  Error,
  { quotationId: string; sldId: string; projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId }) => window.api.quotations.delete(quotationId),
    onSuccess: (_data, { sldId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(projectId) })
    }
  })
}
