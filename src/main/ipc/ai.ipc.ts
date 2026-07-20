import { ipcMain } from 'electron'
import { getSldById } from '../db/repositories/sldsRepo'
import {
  completeExtraction,
  createRunningExtraction,
  failExtraction,
  getLatestExtractionForSld
} from '../db/repositories/extractionsRepo'
import { readSldFile } from '../storage/sldStorage'
import { ClaudeProvider } from '../ai/ClaudeProvider'
import type { AIProvider } from '../ai/AIProvider'
import { IPC } from '@shared/types/ipc-contract'
import type { Extraction } from '@shared/types/entities'

let provider: AIProvider | null = null

function getProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add a real key.')
  }
  if (!provider) provider = new ClaudeProvider(apiKey)
  return provider
}

export function registerAiIpc(): void {
  ipcMain.handle(IPC.aiExtractSld, async (event, sldId: string): Promise<Extraction> => {
    const sld = getSldById(sldId)
    if (!sld) throw new Error(`SLD not found: ${sldId}`)

    const extraction = createRunningExtraction(sldId)

    try {
      const pdfBytes = readSldFile(sld.filePath)
      const result = await getProvider().extractComponents({
        pdfBytes,
        filename: sld.filename,
        onProgress: (progress) => {
          event.sender.send(IPC.aiExtractionProgress, { sldId, ...progress })
        }
      })

      completeExtraction(extraction.id, result.model, {
        components: result.components,
        flags: result.flags
      })

      return {
        ...extraction,
        status: 'done',
        model: result.model,
        components: result.components,
        flags: result.flags,
        completedAt: new Date().toISOString()
      }
    } catch (err) {
      const message = (err as Error).message
      failExtraction(extraction.id, message)
      event.sender.send(IPC.aiExtractionProgress, { sldId, pct: 0, stage: 'Failed' })
      throw err
    }
  })

  ipcMain.handle(IPC.aiGetExtraction, (_event, sldId: string) => getLatestExtractionForSld(sldId))
}
