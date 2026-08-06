import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import { checkForUpdate, getUpdateStatus } from '../updateCheck/updateCheck'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
  safeHandle(IPC.appGetUpdateStatus, (): UpdateStatus | null => getUpdateStatus())

  // Unlike the launch-time check, this is a direct response to the user
  // clicking "Check for Updates" in Settings — its failure is worth
  // reporting back, so the boolean from checkForUpdate is passed through
  // instead of being swallowed.
  safeHandle(IPC.appCheckForUpdate, async (): Promise<UpdateCheckResult> => {
    const succeeded = await checkForUpdate(app.getVersion())
    return { status: getUpdateStatus(), succeeded }
  })
}
