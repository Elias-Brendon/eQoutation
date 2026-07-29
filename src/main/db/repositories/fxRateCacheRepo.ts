import { getDb } from '../index'

export interface CachedRate {
  rate: number
  fetchedAt: string
}

interface FxRateCacheRow {
  currency: string
  rate: number
  fetched_at: string
}

export function getCachedRate(currency: string): CachedRate | null {
  const row = getDb().prepare('SELECT * FROM fx_rate_cache WHERE currency = ?').get(currency) as
    FxRateCacheRow | undefined
  return row ? { rate: row.rate, fetchedAt: row.fetched_at } : null
}

export function setCachedRate(currency: string, rate: number, fetchedAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO fx_rate_cache (currency, rate, fetched_at) VALUES (@currency, @rate, @fetched_at)
       ON CONFLICT(currency) DO UPDATE SET rate = @rate, fetched_at = @fetched_at`
    )
    .run({ currency, rate, fetched_at: fetchedAt })
}
