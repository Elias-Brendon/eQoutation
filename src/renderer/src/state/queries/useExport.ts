import { useMutation, type UseMutationResult } from '@tanstack/react-query'

export function useExportProject(): UseMutationResult<string | null, Error, string> {
  return useMutation({
    mutationFn: (projectId: string) => window.api.export.project(projectId)
  })
}

export function useExportTrainingData(): UseMutationResult<string | null, Error, void> {
  return useMutation({
    mutationFn: () => window.api.export.trainingData()
  })
}

export function useExportDiagnosticBundle(): UseMutationResult<string | null, Error, void> {
  return useMutation({
    mutationFn: () => window.api.export.diagnosticBundle()
  })
}
