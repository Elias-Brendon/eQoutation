import { app } from 'electron'
import { rmSync } from 'fs'
import { join } from 'path'

export function deleteProjectFiles(projectId: string): void {
  const dir = join(app.getPath('userData'), 'projects', projectId)
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best-effort — matches deleteQuotationExcelFile's convention: a locked
    // file shouldn't block deleting the project record.
  }
}
