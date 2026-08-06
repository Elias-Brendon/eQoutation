import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import { checkForUpdate, downloadUpdate, getUpdateStatus } from '../updater/autoUpdater'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
  safeHandle(IPC.appGetUpdateStatus, (): UpdateStatus | null => getUpdateStatus())
  safeHandle(IPC.appCheckForUpdate, (): Promise<UpdateCheckResult> => checkForUpdate())
  safeHandle(IPC.appDownloadUpdate, (): Promise<void> => downloadUpdate())
}
