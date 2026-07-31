import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
}
