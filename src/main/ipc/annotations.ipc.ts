import { ipcMain } from 'electron'
import {
  deleteAnnotation,
  insertAnnotation,
  listAnnotationsBySldAndPage
} from '../db/repositories/annotationsRepo'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateAnnotationInput } from '@shared/types/entities'

export function registerAnnotationsIpc(): void {
  ipcMain.handle(IPC.annotationsListBySldAndPage, (_event, sldId: string, pageNumber: number) =>
    listAnnotationsBySldAndPage(sldId, pageNumber)
  )

  ipcMain.handle(IPC.annotationsCreate, (_event, input: CreateAnnotationInput) =>
    insertAnnotation(input)
  )

  ipcMain.handle(IPC.annotationsDelete, (_event, id: string) => deleteAnnotation(id))
}
