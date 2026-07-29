import { listProjects, updateProjectCurrencySettings } from '../db/repositories/projectsRepo'
import { fetchLiveRate } from './frankfurterClient'
import { BASE_CURRENCY } from '@shared/constants/currencies'

// Runs once per app launch (called from main/index.ts's app.whenReady()).
// Refreshes every project's applied exchange rate from the once-a-day
// Frankfurter cache — skips MYR projects (nothing to convert) and projects
// with a manual rate override (user's explicit choice wins). Since
// fetchLiveRate is itself cache-first, repeated launches on the same day
// cost no extra network calls; failures (offline) are swallowed so a
// project just keeps its last-known rate until the next successful check.
export async function refreshStaleProjectExchangeRates(): Promise<void> {
  const projects = listProjects().filter(
    (p) => p.currency !== BASE_CURRENCY && !p.exchangeRateIsManual
  )
  if (projects.length === 0) return

  const uniqueCurrencies = [...new Set(projects.map((p) => p.currency))]
  const rateByCurrency = new Map<string, number>()

  for (const currency of uniqueCurrencies) {
    try {
      const result = await fetchLiveRate(currency)
      rateByCurrency.set(currency, result.rate)
    } catch {
      // Offline or Frankfurter unavailable — leave this currency's projects
      // on their last-known rate for this launch.
    }
  }

  for (const project of projects) {
    const rate = rateByCurrency.get(project.currency)
    if (rate === undefined || rate === project.exchangeRate) continue
    updateProjectCurrencySettings(project.id, {
      currency: project.currency,
      exchangeRate: rate,
      exchangeRateIsManual: false
    })
  }
}
