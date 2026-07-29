import { BrowserWindow, dialog } from 'electron'
import {
  getSldById,
  insertSld,
  listSldsByProject,
  softDeleteSld
} from '../db/repositories/sldsRepo'
import { copyPdfIntoStorage, readSldFile } from '../storage/sldStorage'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { Sld, UploadSldInput } from '@shared/types/entities'

export function registerSldsIpc(): void {
  safeHandle(IPC.sldsListByProject, (_event, projectId: string) => listSldsByProject(projectId))

  safeHandle(IPC.sldsUpload, async (_event, input: UploadSldInput): Promise<Sld | null> => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await dialog.showOpenDialog(focusedWindow as BrowserWindow, {
      title: 'Select a Single Line Diagram PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const { filePath, filename } = copyPdfIntoStorage(input.projectId, result.filePaths[0])
    return insertSld({
      projectId: input.projectId,
      filename,
      filePath,
      sectionGroup: input.sectionGroup
    })
  })

  safeHandle(IPC.sldsDelete, (_event, sldId: string) => softDeleteSld(sldId))

  safeHandle(IPC.sldsReadFile, (_event, sldId: string) => {
    const sld = getSldById(sldId)
    if (!sld) throw new AppError('DB_SLD_NOT_FOUND')
    return readSldFile(sld.filePath)
  })
}
