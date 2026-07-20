import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import ExcelJS from 'exceljs'
import type { Project, Quotation, Sld } from '@shared/types/entities'

// Column layout mirrors catalog/sample.xlsm's per-board sheets (TYPE,
// DESCRIPTION, MAKER, UNIT, LIST $, DISCOUNT, COST, TOTAL, MARGIN, QUOTE),
// with PAGE/MATCH added since our lines are AI-extracted rather than
// hand-entered against a known board.
const HEADERS = [
  'PAGE',
  'TYPE',
  'DESCRIPTION',
  'MAKER',
  'QTY',
  'UOM',
  'LIST $',
  'DISCOUNT',
  'COST',
  'TOTAL',
  'MARGIN',
  'QUOTE',
  'MATCH'
]

function quotationDir(projectId: string): string {
  return join(app.getPath('userData'), 'projects', projectId, 'quotations')
}

export async function writeQuotationWorkbook(
  quotation: Quotation,
  project: Project,
  sld: Sld
): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Quotation')

  sheet.mergeCells('A1:D1')
  sheet.getCell('A1').value = project.name
  sheet.getCell('A1').font = { bold: true, size: 14 }

  sheet.getCell('A2').value = 'Project:'
  sheet.getCell('B2').value = project.substationLabel
  sheet.getCell('A3').value = 'SLD:'
  sheet.getCell('B3').value = sld.filename
  sheet.getCell('A4').value = 'Quotation:'
  sheet.getCell('B4').value = quotation.code
  sheet.getCell('A5').value = 'Date:'
  sheet.getCell('B5').value = new Date(quotation.createdAt).toLocaleDateString()

  const headerRowNumber = 7
  const headerRow = sheet.getRow(headerRowNumber)
  headerRow.values = HEADERS
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin' } }
  })

  let rowNumber = headerRowNumber + 1
  for (const line of quotation.lines) {
    const row = sheet.getRow(rowNumber)
    row.values = [
      line.pageNumber,
      line.tag,
      line.description,
      line.maker,
      line.qty,
      line.uom,
      Number(line.listPrice.toFixed(2)),
      line.discountFactor,
      Number(line.unitCost.toFixed(2)),
      Number(line.totalCost.toFixed(2)),
      line.margin,
      Number(line.quotePrice.toFixed(2)),
      line.matchStatus === 'matched' ? 'Matched' : 'UNMATCHED'
    ]
    if (line.matchStatus === 'unknown') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
      })
    }
    rowNumber++
  }

  const totalsRow = sheet.getRow(rowNumber + 1)
  totalsRow.getCell(9).value = 'Total'
  totalsRow.getCell(9).font = { bold: true }
  totalsRow.getCell(10).value = { formula: `SUM(J${headerRowNumber + 1}:J${rowNumber - 1})` }
  totalsRow.getCell(12).value = { formula: `SUM(L${headerRowNumber + 1}:L${rowNumber - 1})` }
  totalsRow.font = { bold: true }

  sheet.columns.forEach((col, i) => {
    col.width = [6, 16, 40, 12, 6, 8, 12, 10, 12, 12, 8, 12, 12][i] ?? 12
  })

  const dir = quotationDir(project.id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${quotation.code}.xlsx`)
  await workbook.xlsx.writeFile(filePath)
  return filePath
}
