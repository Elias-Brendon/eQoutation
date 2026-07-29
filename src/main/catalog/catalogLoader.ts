import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { getCatalogDir } from '../settings/settingsStore'
import {
  getLastCatalogSync,
  countCatalogItems,
  recordCatalogSync,
  replaceCatalogItems,
  type CatalogItemInput
} from '../db/repositories/catalogRepo'
import { formatErrorCode } from '@shared/errors/errorCodes'
import type { CatalogReloadResult, CatalogStatus } from '@shared/types/entities'

export const HEADER_ALIASES: Record<keyof CatalogItemInput, string[]> = {
  sku: ['type', 'sku'],
  description: ['description'],
  maker: ['maker', 'manufacturer'],
  family: ['family'],
  series: ['series'],
  listPrice: ['list $', 'list'],
  discountFactor: ['discount'],
  unitPrice: ['cost', 'unit price'],
  uom: ['unit', 'uom'],
  sourceRow: []
}

function resolveCatalogFile(catalogDir: string): string | null {
  if (!existsSync(catalogDir)) return null
  const files = readdirSync(catalogDir).filter((f) => f.toLowerCase().endsWith('.xlsx'))
  if (files.length === 0) return null

  const withStats = files.map((f) => ({ f, mtime: statSync(join(catalogDir, f)).mtimeMs }))
  withStats.sort((a, b) => b.mtime - a.mtime)
  return join(catalogDir, withStats[0].f)
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return String(value.result ?? '')
    if (value instanceof Date) return value.toISOString()
  }
  return String(value)
}

function cellNumber(value: ExcelJS.CellValue): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'result' in value) {
    const result = (value as { result: unknown }).result
    if (typeof result === 'number') return result
  }
  const parsed = Number(cellText(value))
  return Number.isFinite(parsed) ? parsed : 0
}

export function findHeaderRow(
  sheet: ExcelJS.Worksheet
): { rowNumber: number; columns: Map<string, number> } | null {
  const maxScan = Math.min(sheet.rowCount, 10)
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r)
    const columns = new Map<string, number>()
    row.eachCell((cell, colNumber) => {
      const text = cellText(cell.value).trim().toLowerCase()
      if (text) columns.set(text, colNumber)
    })
    if (columns.has('description') && (columns.has('type') || columns.has('sku'))) {
      return { rowNumber: r, columns }
    }
  }
  return null
}

export function columnFor(
  columns: Map<string, number>,
  field: keyof CatalogItemInput
): number | null {
  for (const alias of HEADER_ALIASES[field]) {
    const col = columns.get(alias)
    if (col) return col
  }
  return null
}

async function parseWorkbook(filePath: string): Promise<CatalogItemInput[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const header = findHeaderRow(sheet)
  if (!header) return []

  const colSku = columnFor(header.columns, 'sku')
  const colDescription = columnFor(header.columns, 'description')
  if (!colSku || !colDescription) return []

  const colMaker = columnFor(header.columns, 'maker')
  const colFamily = columnFor(header.columns, 'family')
  const colSeries = columnFor(header.columns, 'series')
  const colListPrice = columnFor(header.columns, 'listPrice')
  const colDiscount = columnFor(header.columns, 'discountFactor')
  const colUnitPrice = columnFor(header.columns, 'unitPrice')
  const colUom = columnFor(header.columns, 'uom')

  const items: CatalogItemInput[] = []

  for (let r = header.rowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const sku = cellText(row.getCell(colSku).value).trim()
    const description = cellText(row.getCell(colDescription).value).trim()
    if (!sku && !description) continue

    items.push({
      sku,
      description,
      maker: colMaker ? cellText(row.getCell(colMaker).value).trim() : '',
      family: colFamily ? cellText(row.getCell(colFamily).value).trim() : '',
      series: colSeries ? cellText(row.getCell(colSeries).value).trim() : '',
      listPrice: colListPrice ? cellNumber(row.getCell(colListPrice).value) : 0,
      discountFactor: colDiscount ? cellNumber(row.getCell(colDiscount).value) : 1,
      unitPrice: colUnitPrice ? cellNumber(row.getCell(colUnitPrice).value) : 0,
      uom: colUom ? cellText(row.getCell(colUom).value).trim() : '',
      sourceRow: r
    })
  }

  return items
}

export async function reloadCatalog(): Promise<CatalogReloadResult> {
  const catalogDir = getCatalogDir()
  const sourcePath = resolveCatalogFile(catalogDir)

  if (!sourcePath) {
    return {
      ok: false,
      itemCount: 0,
      sourcePath: null,
      error: formatErrorCode('CAT_NO_XLSX_IN_DIR')
    }
  }

  try {
    const items = await parseWorkbook(sourcePath)
    if (items.length === 0) {
      return {
        ok: false,
        itemCount: 0,
        sourcePath,
        error: formatErrorCode('CAT_NO_HEADER_ROW')
      }
    }
    const count = replaceCatalogItems(items)
    recordCatalogSync(sourcePath, count)
    return { ok: true, itemCount: count, sourcePath }
  } catch (err) {
    console.error('[catalog:reloadCatalog]', err)
    return { ok: false, itemCount: 0, sourcePath, error: formatErrorCode('CAT_PARSE_FAILED') }
  }
}

export function getCatalogStatus(): CatalogStatus {
  const catalogDir = getCatalogDir()
  const lastSync = getLastCatalogSync()
  return {
    catalogDir,
    sourcePath: lastSync?.sourcePath ?? null,
    itemCount: countCatalogItems(),
    lastSyncedAt: lastSync?.syncedAt ?? null
  }
}
