import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import { getUpdateStatus } from '../updateCheck/updateCheck'
import type { UpdateStatus } from '@shared/types/entities'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
  safeHandle(IPC.appGetUpdateStatus, (): UpdateStatus | null => getUpdateStatus())
}
