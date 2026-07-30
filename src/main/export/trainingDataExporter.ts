import { app, dialog, BrowserWindow } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { getDb } from '../db/index'

interface TrainingDataRow {
  id: string
  field_changed: string
  ai_value: string
  human_value: string
  action: string
  note: string | null
  created_at: string
  flag_message: string | null
  flag_severity: string | null
  line_description: string | null
  line_sku: string | null
  page_number: number | null
  sld_filename: string | null
  project_name: string | null
}

// Exports every feedback_log row (across all projects — this is meant to
// become one training corpus, not a per-project artifact) as JSONL, enriched
// with enough context (SLD filename, project, flag/line text) that each row
// is self-describing outside this app's own database.
export async function exportTrainingData(): Promise<string | null> {
  const dateStamp = new Date().toISOString().slice(0, 10)

  const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined
  const result = await dialog.showSaveDialog(focusedWindow as BrowserWindow, {
    title: 'Export training data',
    defaultPath: join(app.getPath('downloads'), `training-data-export-${dateStamp}.jsonl`),
    filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }]
  })
  if (result.canceled || !result.filePath) return null

  const rows = getDb()
    .prepare(
      `SELECT
         fl.id, fl.field_changed, fl.ai_value, fl.human_value, fl.action, fl.note, fl.created_at,
         f.message AS flag_message, f.severity AS flag_severity,
         ql.description AS line_description, ql.sku AS line_sku,
         COALESCE(f.page_number, ql.page_number) AS page_number,
         s.filename AS sld_filename, p.name AS project_name
       FROM feedback_log fl
       LEFT JOIN flags f ON f.id = fl.flag_id
       LEFT JOIN quotation_lines ql ON ql.id = fl.quotation_line_id
       LEFT JOIN quotations q ON q.id = COALESCE(f.quotation_id, ql.quotation_id)
       LEFT JOIN slds s ON s.id = q.sld_id
       LEFT JOIN projects p ON p.id = s.project_id
       ORDER BY fl.created_at ASC`
    )
    .all() as TrainingDataRow[]

  const output = createWriteStream(result.filePath)
  for (const row of rows) {
    const record = {
      id: row.id,
      project: row.project_name,
      sldFilename: row.sld_filename,
      pageNumber: row.page_number,
      fieldChanged: row.field_changed,
      aiValue: row.ai_value,
      humanValue: row.human_value,
      action: row.action,
      note: row.note,
      flagMessage: row.flag_message,
      flagSeverity: row.flag_severity,
      lineDescription: row.line_description,
      lineSku: row.line_sku,
      createdAt: row.created_at
    }
    output.write(JSON.stringify(record) + '\n')
  }
  await new Promise<void>((resolve, reject) => {
    output.end((err: unknown) => (err ? reject(err) : resolve()))
  })

  return result.filePath
}
