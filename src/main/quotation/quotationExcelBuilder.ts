import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import ExcelJS from 'exceljs'
import type { Project, Quotation, QuotationLine, Sld } from '@shared/types/entities'
import { convertFromBase } from '@shared/lib/currencyConversion'
import { PROJECT_STATUS_LABELS } from '@shared/constants/projectStatus'

// Column layout mirrors catalog/sample.xlsm's per-board sheets (TYPE,
// DESCRIPTION, MAKER, UNIT, LIST $, DISCOUNT, COST, TOTAL, MARGIN, QUOTE),
// with PAGE/MATCH added since our lines are AI-extracted rather than
// hand-entered against a known board. PAGE is dropped on per-panel sheets
// (see writeBomSheet) since the sheet itself already identifies the panel.
// LIST $ uses the project's own currency symbol rather than a hardcoded $.
function buildHeaders(currency: string): string[] {
  return [
    'PAGE',
    'TYPE',
    'SKU',
    'DESCRIPTION',
    'MAKER',
    'QTY',
    'UOM',
    `LIST (${currency})`,
    'DISCOUNT',
    'COST',
    'TOTAL',
    'MARGIN',
    'QUOTE',
    'MATCH'
  ]
}
const FULL_WIDTHS = [6, 16, 14, 40, 12, 6, 8, 12, 10, 12, 12, 8, 12, 12]

function quotationDir(projectId: string): string {
  return join(app.getPath('userData'), 'projects', projectId, 'quotations')
}

// Excel worksheet names: max 31 chars, can't contain \/*?:[], can't be
// blank or duplicate an existing sheet's name (case-insensitive).
function sanitizeSheetName(name: string, usedNames: Set<string>): string {
  let base = name.replace(/[\\/*?:[\]]/g, '-').trim()
  if (!base) base = 'Panel'
  base = base.slice(0, 31)

  let candidate = base
  let suffix = 2
  while (usedNames.has(candidate.toLowerCase())) {
    const suffixText = ` (${suffix})`
    candidate = base.slice(0, 31 - suffixText.length) + suffixText
    suffix++
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

// Formats a panel's distinct SLD page numbers as a human-readable label,
// e.g. "Page 1 of the PDF", "Pages 1–3 of the PDF", "Pages 1, 4 of the PDF".
function formatPdfPageLabel(pageNumbers: number[]): string {
  const sorted = [...new Set(pageNumbers)].sort((a, b) => a - b)
  if (sorted.length === 1) return `Page ${sorted[0]} of the PDF`
  const isContiguous = sorted.every((page, i) => i === 0 || page === sorted[i - 1] + 1)
  if (isContiguous) return `Pages ${sorted[0]}–${sorted[sorted.length - 1]} of the PDF`
  return `Pages ${sorted.join(', ')} of the PDF`
}

// Writes one BOM sheet (project/SLD/quotation/panel header block, column
// headers, one row per line, a totals row) — shared by the full-BOM sheet
// and each per-panel sheet, differing only in which lines are passed in,
// whether the PAGE column is included, and the panel title shown.
function writeBomSheet(
  sheet: ExcelJS.Worksheet,
  project: Project,
  sld: Sld,
  quotation: Quotation,
  lines: QuotationLine[],
  includePageColumn: boolean,
  panelTitle?: string
): void {
  const rate = project.exchangeRate
  const fullHeaders = buildHeaders(project.currency)
  const headers = includePageColumn ? fullHeaders : fullHeaders.slice(1)
  const widths = includePageColumn ? FULL_WIDTHS : FULL_WIDTHS.slice(1)

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
  if (panelTitle) {
    sheet.getCell('A6').value = 'Panel:'
    sheet.getCell('B6').value = panelTitle
    sheet.getCell('B6').font = { bold: true }
    sheet.getCell('A7').value = 'SLD Page:'
    sheet.getCell('B7').value = formatPdfPageLabel(lines.map((line) => line.pageNumber))
  }

  const headerRowNumber = panelTitle ? 8 : 7
  const headerRow = sheet.getRow(headerRowNumber)
  headerRow.values = headers
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin' } }
  })

  let rowNumber = headerRowNumber + 1
  for (const line of lines) {
    const row = sheet.getRow(rowNumber)
    const fullValues = [
      line.pageNumber,
      line.tag,
      line.sku,
      line.description,
      line.maker,
      line.qty,
      line.uom,
      convertFromBase(line.listPrice, rate),
      line.discountFactor,
      convertFromBase(line.unitCost, rate),
      convertFromBase(line.totalCost, rate),
      line.margin,
      convertFromBase(line.quotePrice, rate),
      line.matchStatus === 'matched' ? 'Matched' : 'UNMATCHED'
    ]
    row.values = includePageColumn ? fullValues : fullValues.slice(1)
    if (line.matchStatus === 'unknown') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }
      })
    }
    rowNumber++
  }

  const totalColIndex = headers.indexOf('TOTAL') + 1
  const quoteColIndex = headers.indexOf('QUOTE') + 1
  const totalColLetter = String.fromCharCode(64 + totalColIndex)
  const quoteColLetter = String.fromCharCode(64 + quoteColIndex)

  const totalsRow = sheet.getRow(rowNumber + 1)
  totalsRow.getCell(totalColIndex - 1).value = 'Total'
  totalsRow.getCell(totalColIndex - 1).font = { bold: true }
  totalsRow.getCell(totalColIndex).value = {
    formula: `SUM(${totalColLetter}${headerRowNumber + 1}:${totalColLetter}${rowNumber - 1})`
  }
  totalsRow.getCell(quoteColIndex).value = {
    formula: `SUM(${quoteColLetter}${headerRowNumber + 1}:${quoteColLetter}${rowNumber - 1})`
  }
  totalsRow.font = { bold: true }

  sheet.columns.forEach((col, i) => {
    col.width = widths[i] ?? 12
  })
}

function writeCoverSheet(sheet: ExcelJS.Worksheet, project: Project): void {
  sheet.mergeCells('A1:B1')
  sheet.getCell('A1').value = project.name
  sheet.getCell('A1').font = { bold: true, size: 16 }

  const rows: [string, string][] = [
    ['Sector', project.sector ?? '—'],
    ['Quotation #', project.quotationNumber],
    ['Company', project.company ?? '—'],
    ['Coordinator', project.coordinator ?? '—'],
    ['Status', PROJECT_STATUS_LABELS[project.status]],
    ['Enquiry Date', new Date(project.createdAt).toLocaleDateString()],
    ['Created by', project.createdBy ?? '—']
  ]

  rows.forEach(([label, value], i) => {
    const rowNumber = i + 3
    sheet.getCell(`A${rowNumber}`).value = `${label}:`
    sheet.getCell(`A${rowNumber}`).font = { bold: true }
    sheet.getCell(`B${rowNumber}`).value = value
  })

  sheet.getColumn(1).width = 16
  sheet.getColumn(2).width = 40
}

export async function writeQuotationWorkbook(
  quotation: Quotation,
  project: Project,
  sld: Sld
): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  const usedSheetNames = new Set<string>()

  const coverSheet = workbook.addWorksheet(sanitizeSheetName('Project Details', usedSheetNames))
  writeCoverSheet(coverSheet, project)

  const fullBomSheet = workbook.addWorksheet(sanitizeSheetName('Full BOM', usedSheetNames))
  writeBomSheet(fullBomSheet, project, sld, quotation, quotation.lines, true)

  // One sheet per panel (panelName), ordered by where each panel first
  // appears in the SLD rather than alphabetically by name.
  const panelNames = [...new Set(quotation.lines.map((l) => l.panelName))]
  const panelGroups = panelNames
    .map((name) => {
      const panelLines = quotation.lines.filter((l) => l.panelName === name)
      const minPage = Math.min(...panelLines.map((l) => l.pageNumber))
      return { name, lines: panelLines, minPage }
    })
    .sort((a, b) => a.minPage - b.minPage)

  for (const group of panelGroups) {
    const panelSheet = workbook.addWorksheet(sanitizeSheetName(group.name, usedSheetNames))
    writeBomSheet(panelSheet, project, sld, quotation, group.lines, false, group.name)
  }

  const dir = quotationDir(project.id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${quotation.code}.xlsx`)
  await workbook.xlsx.writeFile(filePath)
  return filePath
}

export function deleteQuotationExcelFile(filePath: string): void {
  if (!existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch {
    // Best-effort cleanup — e.g. the file may be open in Excel (EBUSY on
    // Windows). Deleting the quotation record shouldn't be blocked by a
    // locked export file; it's just left orphaned on disk.
  }
}
