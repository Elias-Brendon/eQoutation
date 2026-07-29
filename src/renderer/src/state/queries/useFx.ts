import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { FxRateResult } from '@shared/types/entities'

export interface FetchRateInput {
  targetCurrency: string
  /** Bypasses the once-a-day cache — used by the explicit Refresh button. */
  forceRefresh?: boolean
}

// A mutation, not a query — fetching a rate is a deliberate action (switching
// currency or hitting refresh), not something to auto-run/cache in the UI
// layer (the daily caching itself lives server-side in fxRateCacheRepo).
export function useFxRate(): UseMutationResult<FxRateResult, Error, FetchRateInput> {
  return useMutation({
    mutationFn: ({ targetCurrency, forceRefresh }) =>
      window.api.fx.getRate(targetCurrency, forceRefresh)
  })
}
