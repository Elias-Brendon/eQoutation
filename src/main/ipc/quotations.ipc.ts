import { randomUUID } from 'crypto'
import { shell } from 'electron'
import { getSldById, updateSldStatus } from '../db/repositories/sldsRepo'
import { getProjectById } from '../db/repositories/projectsRepo'
import { getLatestExtractionForSld } from '../db/repositories/extractionsRepo'
import { getAllCatalogItems } from '../db/repositories/catalogRepo'
import {
  createQuotationWithLines,
  getLatestQuotationForSld,
  getQuotationById,
  listQuotationsByProject,
  setQuotationExcelPath,
  approveQuotation,
  rejectQuotation,
  deleteQuotation,
  updateQuotationLineMargin,
  updatePanelMargin,
  type QuotationLineInput
} from '../db/repositories/quotationsRepo'
import { createFlags, type CreateFlagInput } from '../db/repositories/flagsRepo'
import { addComment, listComments } from '../db/repositories/quotationCommentsRepo'
import { matchComponent } from '../quotation/catalogMatcher'
import {
  writeQuotationWorkbook,
  deleteQuotationExcelFile
} from '../quotation/quotationExcelBuilder'
import { getSettings } from '../settings/settingsStore'
import { resolveEffectivePreferredBrands } from '../settings/preferredBrandResolver'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { Quotation, QuotationComment } from '@shared/types/entities'

function generateQuotationCode(): string {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `Q-${dateStamp}-${randomUUID().slice(0, 6).toUpperCase()}`
}

export function registerQuotationsIpc(): void {
  safeHandle(IPC.quotationsGenerate, (_event, sldId: string): Quotation => {
    const sld = getSldById(sldId)
    if (!sld) throw new AppError('DB_SLD_NOT_FOUND')

    const extraction = getLatestExtractionForSld(sldId)
    if (!extraction || extraction.status !== 'done') {
      throw new AppError('QT_NOT_EXTRACTED')
    }

    const catalogItems = getAllCatalogItems()
    const { defaultMargin, confidenceThreshold, preferredBrands, preferredBrandsByType } =
      getSettings()

    const lineInputs: QuotationLineInput[] = extraction.components.map((component) => {
      const { catalogItem, confidence } = matchComponent(
        component,
        catalogItems,
        resolveEffectivePreferredBrands(component.componentType, {
          preferredBrands,
          preferredBrandsByType
        })
      )
      const unitCost = catalogItem?.unitPrice ?? 0
      const totalCost = component.qty * unitCost
      return {
        catalogItemId: catalogItem?.id ?? null,
        pageNumber: component.pageNumber,
        panelName: component.panelName,
        tag: component.tag,
        sku: catalogItem?.sku ?? '',
        componentType: component.componentType ?? '',
        description: catalogItem?.description ?? component.description,
        maker: catalogItem?.maker ?? '',
        qty: component.qty,
        uom: catalogItem?.uom ?? component.uom,
        listPrice: catalogItem?.listPrice ?? 0,
        discountFactor: catalogItem?.discountFactor ?? 1,
        unitCost,
        totalCost,
        margin: defaultMargin,
        quotePrice: totalCost * defaultMargin,
        matchStatus: catalogItem ? 'matched' : 'unknown',
        matchConfidence: confidence,
        aiConfidence: component.confidence
      }
    })

    updateSldStatus(sldId, 'in_progress')

    const quotation = createQuotationWithLines(
      sldId,
      extraction.id,
      generateQuotationCode(),
      lineInputs
    )

    const flagInputs: CreateFlagInput[] = []
    for (const line of quotation.lines) {
      if (line.matchStatus === 'unknown') {
        flagInputs.push({
          quotationLineId: line.id,
          origin: 'matcher',
          severity: 'warning',
          message: `Unmatched item: "${line.description}" (page ${line.pageNumber}) — no catalog match found.`,
          pageNumber: line.pageNumber
        })
      }
      if (line.aiConfidence < confidenceThreshold) {
        flagInputs.push({
          quotationLineId: line.id,
          origin: 'ai',
          severity: 'warning',
          message: `Low-confidence extraction: "${line.description}" (page ${line.pageNumber}) — AI confidence ${(line.aiConfidence * 100).toFixed(0)}%.`,
          pageNumber: line.pageNumber
        })
      }
    }
    for (const flag of extraction.flags) {
      flagInputs.push({
        quotationLineId: null,
        origin: 'ai',
        severity: flag.severity,
        message: flag.message,
        pageNumber: flag.pageNumber
      })
    }
    if (flagInputs.length > 0) createFlags(quotation.id, flagInputs)

    return quotation
  })

  safeHandle(IPC.quotationsGetBySld, (_event, sldId: string) => getLatestQuotationForSld(sldId))

  safeHandle(IPC.quotationsListByProject, (_event, projectId: string) =>
    listQuotationsByProject(projectId)
  )

  safeHandle(IPC.quotationsExport, async (_event, quotationId: string): Promise<Quotation> => {
    const quotation = getQuotationById(quotationId)
    if (!quotation) throw new AppError('DB_QUOTATION_NOT_FOUND')
    const sld = getSldById(quotation.sldId)
    if (!sld) throw new AppError('DB_SLD_NOT_FOUND')
    const project = getProjectById(sld.projectId)
    if (!project) throw new AppError('DB_PROJECT_NOT_FOUND')

    const filePath = await writeQuotationWorkbook(quotation, project, sld)
    setQuotationExcelPath(quotation.id, filePath)
    shell.showItemInFolder(filePath)

    return { ...quotation, excelFilePath: filePath }
  })

  safeHandle(
    IPC.quotationsApprove,
    (_event, quotationId: string, comment?: string): Quotation => {
      const quotation = getQuotationById(quotationId)
      if (!quotation) throw new AppError('DB_QUOTATION_NOT_FOUND')

      approveQuotation(quotationId)
      updateSldStatus(quotation.sldId, 'done')
      if (comment && comment.trim().length > 0) addComment(quotationId, comment.trim())

      return getQuotationById(quotationId) as Quotation
    }
  )

  safeHandle(
    IPC.quotationsReject,
    (_event, quotationId: string, comment?: string): Quotation => {
      const quotation = getQuotationById(quotationId)
      if (!quotation) throw new AppError('DB_QUOTATION_NOT_FOUND')

      rejectQuotation(quotationId)
      updateSldStatus(quotation.sldId, 'rejected')
      if (comment && comment.trim().length > 0) addComment(quotationId, comment.trim())

      return getQuotationById(quotationId) as Quotation
    }
  )

  safeHandle(
    IPC.quotationsAddComment,
    (_event, quotationId: string, body: string): QuotationComment => addComment(quotationId, body)
  )

  safeHandle(IPC.quotationsListComments, (_event, quotationId: string) =>
    listComments(quotationId)
  )

  safeHandle(IPC.quotationsDelete, (_event, quotationId: string): void => {
    const quotation = getQuotationById(quotationId)
    if (!quotation) throw new AppError('DB_QUOTATION_NOT_FOUND')
    if (quotation.excelFilePath) deleteQuotationExcelFile(quotation.excelFilePath)
    deleteQuotation(quotationId)
  })

  safeHandle(
    IPC.quotationLinesUpdateMargin,
    (_event, lineId: string, margin: number): void => {
      updateQuotationLineMargin(lineId, margin)
    }
  )

  safeHandle(
    IPC.quotationPanelsUpdateMargin,
    (_event, quotationId: string, panelName: string, margin: number): void => {
      updatePanelMargin(quotationId, panelName, margin)
    }
  )
}
