import { randomUUID } from 'crypto'
import { ipcMain, shell } from 'electron'
import { getSldById } from '../db/repositories/sldsRepo'
import { getProjectById } from '../db/repositories/projectsRepo'
import { getLatestExtractionForSld } from '../db/repositories/extractionsRepo'
import { getAllCatalogItems } from '../db/repositories/catalogRepo'
import {
  createQuotationWithLines,
  getLatestQuotationForSld,
  getQuotationById,
  listQuotationsByProject,
  setQuotationExcelPath,
  type QuotationLineInput
} from '../db/repositories/quotationsRepo'
import { matchComponent } from '../quotation/catalogMatcher'
import { writeQuotationWorkbook } from '../quotation/quotationExcelBuilder'
import { IPC } from '@shared/types/ipc-contract'
import type { Quotation } from '@shared/types/entities'

const DEFAULT_MARGIN = 1.35

function generateQuotationCode(): string {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `Q-${dateStamp}-${randomUUID().slice(0, 6).toUpperCase()}`
}

export function registerQuotationsIpc(): void {
  ipcMain.handle(IPC.quotationsGenerate, (_event, sldId: string): Quotation => {
    const sld = getSldById(sldId)
    if (!sld) throw new Error(`SLD not found: ${sldId}`)

    const extraction = getLatestExtractionForSld(sldId)
    if (!extraction || extraction.status !== 'done') {
      throw new Error('Run AI extraction on this SLD before generating a quotation.')
    }

    const catalogItems = getAllCatalogItems()

    const lineInputs: QuotationLineInput[] = extraction.components.map((component) => {
      const { catalogItem, confidence } = matchComponent(component, catalogItems)
      const unitCost = catalogItem?.unitPrice ?? 0
      const totalCost = component.qty * unitCost
      return {
        catalogItemId: catalogItem?.id ?? null,
        pageNumber: component.pageNumber,
        tag: component.tag,
        description: catalogItem?.description ?? component.description,
        maker: catalogItem?.maker ?? '',
        qty: component.qty,
        uom: catalogItem?.uom ?? component.uom,
        listPrice: catalogItem?.listPrice ?? 0,
        discountFactor: catalogItem?.discountFactor ?? 1,
        unitCost,
        totalCost,
        margin: DEFAULT_MARGIN,
        quotePrice: totalCost * DEFAULT_MARGIN,
        matchStatus: catalogItem ? 'matched' : 'unknown',
        matchConfidence: confidence
      }
    })

    return createQuotationWithLines(sldId, extraction.id, generateQuotationCode(), lineInputs)
  })

  ipcMain.handle(IPC.quotationsGetBySld, (_event, sldId: string) => getLatestQuotationForSld(sldId))

  ipcMain.handle(IPC.quotationsListByProject, (_event, projectId: string) =>
    listQuotationsByProject(projectId)
  )

  ipcMain.handle(IPC.quotationsExport, async (_event, quotationId: string): Promise<Quotation> => {
    const quotation = getQuotationById(quotationId)
    if (!quotation) throw new Error(`Quotation not found: ${quotationId}`)
    const sld = getSldById(quotation.sldId)
    if (!sld) throw new Error(`SLD not found: ${quotation.sldId}`)
    const project = getProjectById(sld.projectId)
    if (!project) throw new Error(`Project not found: ${sld.projectId}`)

    const filePath = await writeQuotationWorkbook(quotation, project, sld)
    setQuotationExcelPath(quotation.id, filePath)
    shell.showItemInFolder(filePath)

    return { ...quotation, excelFilePath: filePath }
  })
}
