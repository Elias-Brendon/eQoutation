import { ipcMain } from 'electron'
import {
  listFlagsByQuotation,
  countOpenFlagsByProject,
  raiseHumanFlag,
  resolveFlag
} from '../db/repositories/flagsRepo'
import { IPC } from '@shared/types/ipc-contract'
import type { Flag, FlagOriginCounts, RaiseFlagInput } from '@shared/types/entities'

export function registerFlagsIpc(): void {
  ipcMain.handle(IPC.flagsListByQuotation, (_event, quotationId: string): Flag[] =>
    listFlagsByQuotation(quotationId)
  )

  ipcMain.handle(IPC.flagsCountOpenByProject, (_event, projectId: string): FlagOriginCounts =>
    countOpenFlagsByProject(projectId)
  )

  ipcMain.handle(IPC.flagsRaise, (_event, input: RaiseFlagInput): Flag => raiseHumanFlag(input))

  ipcMain.handle(IPC.flagsResolve, (_event, id: string, resolutionNote?: string): void =>
    resolveFlag(id, resolutionNote)
  )
}
