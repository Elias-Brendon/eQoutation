import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs'
import { join, basename } from 'path'

function sldStorageDir(projectId: string): string {
  return join(app.getPath('userData'), 'projects', projectId, 'slds')
}

export function copyPdfIntoStorage(
  projectId: string,
  sourcePath: string
): { filePath: string; filename: string } {
  const dir = sldStorageDir(projectId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const originalName = basename(sourcePath)
  const storedName = `${randomUUID()}-${originalName}`
  const filePath = join(dir, storedName)
  copyFileSync(sourcePath, filePath)

  return { filePath, filename: originalName }
}

export function readSldFile(filePath: string): Uint8Array {
  return new Uint8Array(readFileSync(filePath))
}
