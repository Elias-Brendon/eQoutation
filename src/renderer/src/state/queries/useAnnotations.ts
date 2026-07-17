import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Annotation, CreateAnnotationInput } from '@shared/types/entities'

export const annotationsQueryKey = (sldId: string, pageNumber: number): readonly unknown[] => [
  'annotations',
  sldId,
  pageNumber
]

export function useAnnotations(sldId: string, pageNumber: number): UseQueryResult<Annotation[]> {
  return useQuery({
    queryKey: annotationsQueryKey(sldId, pageNumber),
    queryFn: () => window.api.annotations.listBySldAndPage(sldId, pageNumber)
  })
}

export function useCreateAnnotation(): UseMutationResult<Annotation, Error, CreateAnnotationInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnnotationInput) => window.api.annotations.create(input),
    onSuccess: (annotation) =>
      queryClient.invalidateQueries({
        queryKey: annotationsQueryKey(annotation.sldId, annotation.pageNumber)
      })
  })
}

export function useDeleteAnnotation(): UseMutationResult<
  void,
  Error,
  { id: string; sldId: string; pageNumber: number }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => window.api.annotations.delete(id),
    onSuccess: (_data, { sldId, pageNumber }) =>
      queryClient.invalidateQueries({ queryKey: annotationsQueryKey(sldId, pageNumber) })
  })
}
