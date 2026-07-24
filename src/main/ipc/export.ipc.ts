import { ipcMain, shell } from 'electron'
import { exportProject } from '../export/projectExporter'
import { IPC } from '@shared/types/ipc-contract'

export function registerExportIpc(): void {
  ipcMain.handle(IPC.exportProject, async (_event, projectId: string): Promise<string | null> => {
    const filePath = await exportProject(projectId)
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })
}
