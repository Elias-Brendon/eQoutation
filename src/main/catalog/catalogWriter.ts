import ExcelJS from 'exceljs'
import { getCatalogStatus, findHeaderRow, columnFor } from './catalogLoader'
import { insertCatalogItem, type CatalogItemInput } from '../db/repositories/catalogRepo'
import { AppError } from '../errors/AppError'
import type { CatalogItem } from '@shared/types/entities'

// Appends a new row to the real source .xlsx (so it survives a future
// catalog reload) and upserts the DB cache directly — no full reload needed
// for the new item to be immediately usable.
export async function addCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  const status = getCatalogStatus()
  if (!status.sourcePath) {
    throw new AppError('CAT_NO_SOURCE_FILE')
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(status.sourcePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new AppError('CAT_NO_SHEET')

  const header = findHeaderRow(sheet)
  if (!header) throw new AppError('CAT_NO_HEADER_ROW')

  const newRowNumber = sheet.rowCount + 1
  const row = sheet.getRow(newRowNumber)

  const setCell = (field: keyof CatalogItemInput, value: string | number): void => {
    const col = columnFor(header.columns, field)
    if (col) row.getCell(col).value = value
  }

  setCell('sku', input.sku)
  setCell('description', input.description)
  if (input.maker) setCell('maker', input.maker)
  if (input.family) setCell('family', input.family)
  if (input.series) setCell('series', input.series)
  setCell('listPrice', input.listPrice ?? 0)
  setCell('discountFactor', input.discountFactor ?? 1)
  setCell('unitPrice', input.unitPrice ?? 0)
  if (input.uom) setCell('uom', input.uom)
  row.commit()

  await workbook.xlsx.writeFile(status.sourcePath)

  return insertCatalogItem({ ...input, sourceRow: newRowNumber })
}
