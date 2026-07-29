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
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type { Extraction } from '@shared/types/entities'

let provider: AIProvider | null = null
let providerCacheKey: string | null = null

function getProvider(): AIProvider {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new AppError('AI_NO_API_KEY')
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
  safeHandle(IPC.aiExtractSld, async (event, sldId: string): Promise<Extraction> => {
    const sld = getSldById(sldId)
    if (!sld) throw new AppError('DB_SLD_NOT_FOUND')

    const extraction = createRunningExtraction(sldId)

    try {
      const pdfBytes = readSldFile(sld.filePath)
      const { enabledComponentTypes, maxExtractionRetries, preferredBrands, customExtractionRules } =
        getSettings()
      const catalogDescriptions = listDistinctDescriptions(preferredBrands)

      const provider = getProvider()

      let result: ExtractionResult | undefined
      let lastError: Error | undefined
      for (let attempt = 0; attempt <= maxExtractionRetries; attempt++) {
        try {
          result = await provider.extractComponents({
            pdfBytes,
            filename: sld.filename,
            enabledComponentTypes,
            catalogDescriptions,
            preferredBrands,
            customRules: customExtractionRules,
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
      if (!result) throw lastError ?? new AppError('AI_REQUEST_FAILED')

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
      // extraction.error is rendered directly to the user in ExtractionPanel,
      // so it must already be sanitized here — don't rely on safeHandle's
      // outer catch for that, it only sanitizes the IPC rejection. Log the
      // original error ourselves since converting it here means safeHandle
      // never sees the real cause.
      if (!(err instanceof AppError)) {
        console.error(`[ipc:${IPC.aiExtractSld}]`, err)
      }
      const appError = err instanceof AppError ? err : new AppError('AI_REQUEST_FAILED')
      failExtraction(extraction.id, appError.message)
      event.sender.send(IPC.aiExtractionProgress, { sldId, pct: 0, stage: 'Failed' })
      throw appError
    }
  })

  safeHandle(IPC.aiGetExtraction, (_event, sldId: string) => getLatestExtractionForSld(sldId))
}
