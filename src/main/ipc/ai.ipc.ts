import { getSldById } from '../db/repositories/sldsRepo'
import {
  assertCanExtract,
  completeExtraction,
  createRunningExtraction,
  failExtraction,
  getLatestExtractionForSld,
  getProjectTokenUsage,
  type ExtractionUsage
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
import type { Extraction, ProjectTokenUsage } from '@shared/types/entities'

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

function addUsage(a: ExtractionUsage, b: ExtractionUsage): ExtractionUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }
}

export function registerAiIpc(): void {
  safeHandle(
    IPC.aiExtractSld,
    async (event, sldId: string, options?: { force?: boolean }): Promise<Extraction> => {
      const sld = getSldById(sldId)
      if (!sld) throw new AppError('DB_SLD_NOT_FOUND')

      assertCanExtract(sldId, options?.force ?? false)

      const extraction = createRunningExtraction(sldId)
      let accumulatedUsage: ExtractionUsage = { inputTokens: 0, outputTokens: 0 }

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
            accumulatedUsage = addUsage(accumulatedUsage, result.usage)
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

        completeExtraction(
          extraction.id,
          result.model,
          { components: result.components, flags: result.flags },
          accumulatedUsage
        )

        return {
          ...extraction,
          status: 'done',
          model: result.model,
          components: result.components,
          flags: result.flags,
          inputTokens: accumulatedUsage.inputTokens,
          outputTokens: accumulatedUsage.outputTokens,
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
        const usageToPersist =
          accumulatedUsage.inputTokens === 0 && accumulatedUsage.outputTokens === 0
            ? null
            : accumulatedUsage
        failExtraction(extraction.id, appError.message, usageToPersist)
        event.sender.send(IPC.aiExtractionProgress, { sldId, pct: 0, stage: 'Failed' })
        throw appError
      }
    }
  )

  safeHandle(IPC.aiGetExtraction, (_event, sldId: string) => getLatestExtractionForSld(sldId))

  safeHandle(
    IPC.aiGetProjectTokenUsage,
    (_event, projectId: string): ProjectTokenUsage => getProjectTokenUsage(projectId)
  )
}
