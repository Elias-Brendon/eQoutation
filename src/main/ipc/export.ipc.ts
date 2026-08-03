import { shell } from 'electron'
import { exportProject } from '../export/projectExporter'
import { exportTrainingData } from '../export/trainingDataExporter'
import { exportDiagnosticBundle } from '../export/diagnosticBundleExporter'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'

export function registerExportIpc(): void {
  safeHandle(IPC.exportProject, async (_event, projectId: string): Promise<string | null> => {
    const filePath = await exportProject(projectId)
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })

  safeHandle(IPC.exportTrainingData, async (): Promise<string | null> => {
    const filePath = await exportTrainingData()
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })

  safeHandle(IPC.exportDiagnosticBundle, async (): Promise<string | null> => {
    const filePath = await exportDiagnosticBundle()
    if (filePath) shell.showItemInFolder(filePath)
    return filePath
  })
}
