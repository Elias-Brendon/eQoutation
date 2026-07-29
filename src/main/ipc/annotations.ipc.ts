import {
  deleteAnnotation,
  insertAnnotation,
  listAnnotationsBySldAndPage
} from '../db/repositories/annotationsRepo'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { CreateAnnotationInput } from '@shared/types/entities'

export function registerAnnotationsIpc(): void {
  safeHandle(IPC.annotationsListBySldAndPage, (_event, sldId: string, pageNumber: number) =>
    listAnnotationsBySldAndPage(sldId, pageNumber)
  )

  safeHandle(IPC.annotationsCreate, (_event, input: CreateAnnotationInput) =>
    insertAnnotation(input)
  )

  safeHandle(IPC.annotationsDelete, (_event, id: string) => deleteAnnotation(id))
}
