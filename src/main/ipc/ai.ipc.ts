import { ipcMain } from 'electron'
import { getSldById } from '../db/repositories/sldsRepo'
import {
  completeExtraction,
  createRunningExtraction,
  failExtraction,
  getLatestExtractionForSld
} from '../db/repositories/extractionsRepo'
import { readSldFile } from '../storage/sldStorage'
import { listDistinctDescriptions } from '../db/repositories/catalogRepo'
import { ClaudeProvider } from '../ai/ClaudeProvider'
import type { AIProvider, ExtractionResult } from '../ai/AIProvider'
import { getSettings } from '../settings/settingsStore'
import { getAnthropicApiKey } from '../settings/secretsStore'
import { IPC } from '@shared/types/ipc-contract'
import type { Extraction } from '@shared/types/entities'

let provider: AIProvider | null = null
let providerCacheKey: string | null = null

function getProvider(): AIProvider {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key configured. Add one in Settings > API Keys (or set ANTHROPIC_API_KEY in .env for local dev).'
    )
  }
  const { aiModel } = getSettings()
  const cacheKey = `${apiKey}:${aiModel}`
  if (!provider || providerCacheKey !== cacheKey) {
    provider = new ClaudeProvider(apiKey, aiModel)
    providerCacheKey = cacheKey
  }
  return provider
}

export function registerAiIpc(): void {
  ipcMain.handle(IPC.aiExtractSld, async (event, sldId: string): Promise<Extraction> => {
    const sld = getSldById(sldId)
    if (!sld) throw new Error(`SLD not found: ${sldId}`)

    const extraction = createRunningExtraction(sldId)

    try {
      const pdfBytes = readSldFile(sld.filePath)
      const { enabledComponentTypes, maxExtractionRetries } = getSettings()
      const catalogDescriptions = listDistinctDescriptions()

      let result: ExtractionResult | undefined
      let lastError: Error | undefined
      for (let attempt = 0; attempt <= maxExtractionRetries; attempt++) {
        try {
          result = await getProvider().extractComponents({
            pdfBytes,
            filename: sld.filename,
            enabledComponentTypes,
            catalogDescriptions,
            onProgress: (progress) => {
              event.sender.send(IPC.aiExtractionProgress, { sldId, ...progress })
            }
          })
          break
        } catch (err) {
          lastError = err as Error
          if (attempt < maxExtractionRetries) {
            event.sender.send(IPC.aiExtractionProgress, {
              sldId,
              pct: 0,
              stage: `Retrying (attempt ${attempt + 2}/${maxExtractionRetries + 1})`
            })
          }
        }
      }
      if (!result) throw lastError ?? new Error('Extraction failed')

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
