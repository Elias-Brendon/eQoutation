import { ipcMain } from 'electron'
import {
  listFlagsByQuotation,
  countOpenFlagsByProject,
  raiseHumanFlag,
  resolveFlag,
  getFlagById
} from '../db/repositories/flagsRepo'
import { getQuotationLineById, applyLineMatch } from '../db/repositories/quotationsRepo'
import { getAllCatalogItems, getCatalogItemById } from '../db/repositories/catalogRepo'
import { addCatalogItem } from '../catalog/catalogWriter'
import { matchComponent } from '../quotation/catalogMatcher'
import { getSettings } from '../settings/settingsStore'
import { IPC } from '@shared/types/ipc-contract'
import type {
  CatalogItem,
  Flag,
  FlagOriginCounts,
  NewCatalogItemInput,
  RaiseFlagInput,
  ResolveUnmatchedLineResult
} from '@shared/types/entities'

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

  ipcMain.handle(
    IPC.flagsResolveUnmatchedLine,
    (_event, flagId: string): ResolveUnmatchedLineResult => {
      const flag = getFlagById(flagId)
      if (!flag) throw new Error(`Flag not found: ${flagId}`)
      if (!flag.quotationLineId) throw new Error('Flag is not linked to a quotation line')

      const line = getQuotationLineById(flag.quotationLineId)
      if (!line) throw new Error(`Quotation line not found: ${flag.quotationLineId}`)

      const catalogItems = getAllCatalogItems()
      const { preferredBrands } = getSettings()
      const { catalogItem, confidence } = matchComponent(
        {
          description: line.description,
          qty: line.qty,
          uom: line.uom,
          tag: line.tag,
          pageNumber: line.pageNumber,
          panelName: line.panelName,
          confidence: 0,
          notes: ''
        },
        catalogItems,
        preferredBrands
      )

      if (!catalogItem) return { matched: false, catalogItem: null }

      applyLineMatch(line.id, catalogItem, confidence)
      resolveFlag(
        flagId,
        `Auto-matched to catalog item "${catalogItem.description}" (${catalogItem.sku}) on resolve.`
      )
      return { matched: true, catalogItem }
    }
  )

  ipcMain.handle(
    IPC.flagsLinkLineToCatalogItem,
    (_event, flagId: string | null, lineId: string, catalogItemId: string): void => {
      const catalogItem = getCatalogItemById(catalogItemId)
      if (!catalogItem) throw new Error(`Catalog item not found: ${catalogItemId}`)

      applyLineMatch(lineId, catalogItem, 1)
      if (flagId) {
        resolveFlag(
          flagId,
          `Manually matched to catalog item "${catalogItem.description}" (${catalogItem.sku}).`
        )
      }
    }
  )

  ipcMain.handle(
    IPC.flagsAddCatalogItemAndLink,
    async (
      _event,
      flagId: string | null,
      lineId: string,
      input: NewCatalogItemInput
    ): Promise<CatalogItem> => {
      const catalogItem = await addCatalogItem(input)
      applyLineMatch(lineId, catalogItem, 1)
      if (flagId) {
        resolveFlag(
          flagId,
          `Added new catalog item "${catalogItem.description}" (${catalogItem.sku}) and matched.`
        )
      }
      return catalogItem
    }
  )
}
