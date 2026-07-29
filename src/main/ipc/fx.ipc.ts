import { fetchLiveRate } from '../fx/frankfurterClient'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { FxRateResult } from '@shared/types/entities'

export function registerFxIpc(): void {
  safeHandle(
    IPC.fxGetRate,
    (_event, targetCurrency: string, forceRefresh: boolean): Promise<FxRateResult> =>
      fetchLiveRate(targetCurrency, { forceRefresh })
  )
}
