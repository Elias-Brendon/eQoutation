import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Quotation } from '@shared/types/entities'

const quotationQueryKey = (sldId: string): readonly [string, string] => ['quotation', sldId]
const projectQuotationsQueryKey = (projectId: string): readonly [string, string] => [
  'quotations',
  projectId
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
