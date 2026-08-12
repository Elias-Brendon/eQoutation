import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  AddQuotationLineInput,
  NewCatalogItemInput,
  Quotation,
  QuotationComment,
  QuotationLine
} from '@shared/types/entities'
import { sldsQueryKey } from './useSlds'
import { flagsQueryKey, openFlagCountsQueryKey } from './useFlags'
import { useUiStore } from '@renderer/state/useUiStore'

export const quotationQueryKey = (sldId: string): readonly [string, string] => ['quotation', sldId]
const quotationByIdQueryKey = (quotationId: string): readonly [string, string, string] => [
  'quotation',
  'byId',
  quotationId
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

export function useQuotationById(quotationId: string | null): UseQueryResult<Quotation | null> {
  return useQuery({
    queryKey: quotationByIdQueryKey(quotationId ?? ''),
    queryFn: () => window.api.quotations.getById(quotationId as string),
    enabled: quotationId !== null
  })
}

// Resolves to a specific historical quotation when the sidebar history list
// has pinned one for this SLD (selectedQuotationId in useUiStore), otherwise
// falls back to the latest quotation for the SLD. Shared by QuotationTable
// and CenterPanel so both agree on which quotation is "active": editing,
// approving, or exporting a pinned historical quotation must not silently
// act on the newest one instead.
export function useEffectiveQuotation(sldId: string | null): UseQueryResult<Quotation | null> {
  const selectedSldId = useUiStore((s) => s.selectedSldId)
  const selectedQuotationId = useUiStore((s) => s.selectedQuotationId)
  const pinnedId = sldId !== null && sldId === selectedSldId ? selectedQuotationId : null

  const latest = useQuotation(pinnedId ? null : sldId)
  const pinned = useQuotationById(pinnedId)

  return pinnedId ? pinned : latest
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
      queryClient.setQueryData(quotationByIdQueryKey(quotation.id), quotation)
      queryClient.invalidateQueries({ queryKey: quotationQueryKey(sldId) })
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
  queryClient.setQueryData(quotationByIdQueryKey(quotation.id), quotation)
  queryClient.invalidateQueries({ queryKey: quotationQueryKey(variables.sldId) })
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
    }
  })
}

export function useUpdateLineQty(): UseMutationResult<
  void,
  Error,
  { lineId: string; qty: number; sldId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, qty }) => window.api.quotations.updateLineQty(lineId, qty),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
    }
  })
}

export function useAddQuotationLine(): UseMutationResult<
  QuotationLine,
  Error,
  { quotationId: string; catalogItemId: string; input: AddQuotationLineInput; sldId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, catalogItemId, input }) =>
      window.api.quotations.addLine(quotationId, catalogItemId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
    }
  })
}

export function useAddQuotationLineWithNewCatalogItem(): UseMutationResult<
  QuotationLine,
  Error,
  {
    quotationId: string
    catalogInput: NewCatalogItemInput
    input: AddQuotationLineInput
    sldId: string
  }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, catalogInput, input }) =>
      window.api.quotations.addLineWithNewCatalogItem(quotationId, catalogInput, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
      queryClient.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}

export function useRemoveQuotationLine(): UseMutationResult<
  void,
  Error,
  { lineId: string; sldId: string; projectId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId }) => window.api.quotations.removeLine(lineId),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(projectId) })
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
    onSuccess: (_data, { quotationId, projectId }) => {
      // If the deleted quotation was pinned as the active selection, drop the
      // pin so the view falls back to whatever is now latest for the SLD
      // instead of pointing at a quotation that no longer exists.
      if (useUiStore.getState().selectedQuotationId === quotationId) {
        useUiStore.getState().clearQuotation()
      }
      queryClient.invalidateQueries({ queryKey: ['quotation'] })
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: openFlagCountsQueryKey(projectId) })
    }
  })
}
