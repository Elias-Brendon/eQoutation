import { shell } from 'electron'
import { exportProject } from '../export/projectExporter'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'

export function registerExportIpc(): void {
  safeHandle(IPC.exportProject, async (_event, projectId: string): Promise<string | null> => {
    const filePath = await exportProject(projectId)
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })
}
