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
import { resolveEffectivePreferredBrands } from '../settings/preferredBrandResolver'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
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
  safeHandle(IPC.flagsListByQuotation, (_event, quotationId: string): Flag[] =>
    listFlagsByQuotation(quotationId)
  )

  safeHandle(IPC.flagsCountOpenByProject, (_event, projectId: string): FlagOriginCounts =>
    countOpenFlagsByProject(projectId)
  )

  safeHandle(IPC.flagsRaise, (_event, input: RaiseFlagInput): Flag => raiseHumanFlag(input))

  safeHandle(IPC.flagsResolve, (_event, id: string, resolutionNote?: string): void =>
    resolveFlag(id, resolutionNote)
  )

  safeHandle(
    IPC.flagsResolveUnmatchedLine,
    (_event, flagId: string): ResolveUnmatchedLineResult => {
      const flag = getFlagById(flagId)
      if (!flag) throw new AppError('DB_FLAG_NOT_FOUND')
      if (!flag.quotationLineId) throw new AppError('DB_FLAG_NOT_LINKED')

      const line = getQuotationLineById(flag.quotationLineId)
      if (!line) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

      const catalogItems = getAllCatalogItems()
      const { preferredBrands, preferredBrandsByType } = getSettings()
      const { catalogItem, confidence } = matchComponent(
        {
          description: line.description,
          qty: line.qty,
          uom: line.uom,
          tag: line.tag,
          pageNumber: line.pageNumber,
          panelName: line.panelName,
          componentType: line.componentType,
          confidence: 0,
          notes: ''
        },
        catalogItems,
        resolveEffectivePreferredBrands(line.componentType, { preferredBrands, preferredBrandsByType })
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

  safeHandle(
    IPC.flagsLinkLineToCatalogItem,
    (_event, flagId: string | null, lineId: string, catalogItemId: string): void => {
      const catalogItem = getCatalogItemById(catalogItemId)
      if (!catalogItem) throw new AppError('DB_CATALOG_ITEM_NOT_FOUND')

      applyLineMatch(lineId, catalogItem, 1)
      if (flagId) {
        resolveFlag(
          flagId,
          `Manually matched to catalog item "${catalogItem.description}" (${catalogItem.sku}).`
        )
      }
    }
  )

  safeHandle(
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
