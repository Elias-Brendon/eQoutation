import { app, dialog, BrowserWindow } from 'electron'
import { readFileSync, createWriteStream } from 'fs'
import { join } from 'path'
import archiver from 'archiver'
import { getProjectById } from '../db/repositories/projectsRepo'
import { listSldsByProject } from '../db/repositories/sldsRepo'
import { getLatestQuotationForSld } from '../db/repositories/quotationsRepo'
import { listAnnotationsBySld } from '../db/repositories/annotationsRepo'
import { readSldFile } from '../storage/sldStorage'
import { writeQuotationWorkbook } from '../quotation/quotationExcelBuilder'
import { flattenAnnotations } from './annotationFlattener'
import { AppError } from '../errors/AppError'

interface ManifestSldEntry {
  filename: string
  status: string
  quotationCode: string | null
  quotationStatus: string | null
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_. ]/gi, '_')
}

// Bundles a project's SLDs (with annotations baked in) and their latest
// quotations into a single .zip, alongside a manifest. Returns the saved
// file path, or null if the user canceled the save dialog.
export async function exportProject(projectId: string): Promise<string | null> {
  const project = getProjectById(projectId)
  if (!project) throw new AppError('DB_PROJECT_NOT_FOUND')

  const slds = listSldsByProject(projectId)
  const dateStamp = new Date().toISOString().slice(0, 10)
  const safeProjectName = sanitizeFilename(project.name)

  const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
  const result = await dialog.showSaveDialog(focusedWindow as BrowserWindow, {
    title: 'Export project',
    defaultPath: join(app.getPath('downloads'), `${safeProjectName}-export-${dateStamp}.zip`),
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
  })
  if (result.canceled || !result.filePath) return null

  const output = createWriteStream(result.filePath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  const closed = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
  })
  archive.pipe(output)

  const manifestEntries: ManifestSldEntry[] = []

  for (const sld of slds) {
    const quotation = getLatestQuotationForSld(sld.id)
    const annotations = listAnnotationsBySld(sld.id)
    const pdfBytes = readSldFile(sld.filePath)
    const flattened = await flattenAnnotations(pdfBytes, annotations)
    archive.append(Buffer.from(flattened), { name: `slds/${sanitizeFilename(sld.filename)}` })

    let quotationCode: string | null = null
    let quotationStatus: string | null = null
    if (quotation) {
      quotationCode = quotation.code
      quotationStatus = quotation.status
      const xlsxPath = await writeQuotationWorkbook(quotation, project, sld)
      archive.append(readFileSync(xlsxPath), { name: `quotations/${quotation.code}.xlsx` })
    }

    manifestEntries.push({
      filename: sld.filename,
      status: sld.status,
      quotationCode,
      quotationStatus
    })
  }

  const manifest = {
    project: project.name,
    substationLabel: project.substationLabel,
    exportedAt: new Date().toISOString(),
    slds: manifestEntries
  }
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

  await archive.finalize()
  await closed

  return result.filePath
}
