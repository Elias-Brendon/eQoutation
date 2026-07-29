import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ProjectTokenUsage } from '@shared/types/entities'

export function useProjectTokenUsage(projectId: string | null): UseQueryResult<ProjectTokenUsage> {
  return useQuery({
    queryKey: ['ai-token-usage', projectId ?? ''],
    queryFn: () => window.api.ai.getProjectTokenUsage(projectId as string),
    enabled: projectId !== null
  })
}
