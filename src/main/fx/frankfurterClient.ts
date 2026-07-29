import { getCachedRate, setCachedRate } from '../db/repositories/fxRateCacheRepo'
import { AppError } from '../errors/AppError'
import type { FxRateResult } from '@shared/types/entities'

// Frankfurter (ECB reference rates) — free, keyless. api.frankfurter.app
// 301-redirects to this canonical .dev domain; hitting it directly avoids
// the extra round trip.
const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v1/latest'

interface FrankfurterResponse {
  rates?: Record<string, number>
}

function isSameUtcDay(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10)
}

async function requestRate(targetCurrency: string): Promise<number> {
  const url = `${FRANKFURTER_BASE_URL}?amount=1&from=MYR&to=${encodeURIComponent(targetCurrency)}`

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new AppError('FX_UNREACHABLE')
  }

  if (!response.ok) {
    throw new AppError('FX_SERVICE_ERROR')
  }

  let payload: FrankfurterResponse
  try {
    payload = (await response.json()) as FrankfurterResponse
  } catch {
    throw new AppError('FX_BAD_RESPONSE')
  }

  const value = payload.rates?.[targetCurrency]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppError('FX_BAD_RESPONSE')
  }
  return value
}

// Serves the MYR→target rate from a once-a-day shared cache (src/main/db/repositories/fxRateCacheRepo.ts)
// to keep Frankfurter calls to at most one per currency per day across the
// whole app. Pass forceRefresh to bypass the cache for an explicit
// user-triggered refresh.
export async function fetchLiveRate(
  targetCurrency: string,
  options: { forceRefresh?: boolean } = {}
): Promise<FxRateResult> {
  const now = new Date().toISOString()

  if (!options.forceRefresh) {
    const cached = getCachedRate(targetCurrency)
    if (cached && isSameUtcDay(cached.fetchedAt, now)) {
      return { rate: cached.rate, fetchedAt: cached.fetchedAt, fromCache: true }
    }
  }

  const rate = await requestRate(targetCurrency)
  setCachedRate(targetCurrency, rate, now)
  return { rate, fetchedAt: now, fromCache: false }
}
