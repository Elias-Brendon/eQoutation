import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, ExtractParams, ExtractionResult } from './AIProvider'
import {
  buildExtractionJsonSchema,
  buildVerificationJsonSchema,
  normalizeExtractionPayload,
  normalizeVerificationPayload,
  type ExtractedPanel
} from './extractionSchema'
import {
  buildExtractionSystemPrompt,
  buildVerificationSystemPrompt,
  buildCropZoomSystemPrompt
} from './promptTemplates'
import { loadPdfDocument, renderPdfPagesToImages, renderPdfPanelCrop } from './pdfRenderer'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { dedupeComponents, dedupeFlags } from './dedup'
import { AppError } from '../errors/AppError'
import { formatErrorCode } from '@shared/errors/errorCodes'
import type { TestApiKeyResult } from '@shared/types/entities'

// Dense multi-page SLDs (many components + notes + flags) can need well more
// than a few thousand output tokens; too low a budget truncates the JSON
// mid-string ("Unterminated string in JSON") instead of raising a clear error.
// 64k requires streaming (the SDK/HTTP timeout risk at this size otherwise).
const MAX_TOKENS = 64000

// We stream the response (required at this max_tokens size to avoid HTTP
// timeouts) but only consume the final assembled message, not per-token
// events, so this ticks a heuristic progress estimate up to a cap while the
// request is in flight — good enough for a live-feeling bar, not a precise ETA.
const PROGRESS_TICK_MS = 400
const PROGRESS_TICK_CAP = 88

export class ClaudeProvider implements AIProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async extractComponents({
    pdfBytes,
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules,
    onProgress
  }: ExtractParams): Promise<ExtractionResult> {
    onProgress?.({ pct: 5, stage: 'Reading PDF' })

    onProgress?.({ pct: 10, stage: 'Rendering pages' })
    let pdfDoc: PDFDocumentProxy
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pdfDoc = await loadPdfDocument(pdfBytes)
      pages = await renderPdfPagesToImages(pdfDoc)
    } catch (error) {
      console.error('[ai:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }

    try {
      onProgress?.({ pct: 15, stage: 'Sending to Claude' })

      let pct = 20
      const ticker = setInterval(() => {
        pct = Math.min(PROGRESS_TICK_CAP, pct + 3)
        onProgress?.({ pct, stage: 'Analyzing diagram' })
      }, PROGRESS_TICK_MS)

      const pageContentBlocks = pages.flatMap(
        (page): Anthropic.Messages.ContentBlockParam[] => [
          { type: 'text', text: `Page ${page.pageNumber}` },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: page.base64Png }
          }
        ]
      )

      let message: Anthropic.Messages.Message
      try {
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: MAX_TOKENS,
          // Extended thinking is on by default for this model and, left
          // unbounded, consumes the entire token budget before any structured
          // output is emitted. This task needs the budget spent on output.
          thinking: { type: 'disabled' },
          system: buildExtractionSystemPrompt(
            enabledComponentTypes,
            catalogDescriptions,
            preferredBrands,
            customRules
          ),
          messages: [
            {
              role: 'user',
              content: [
                ...pageContentBlocks,
                {
                  type: 'text',
                  text: 'Extract every component from this switchboard SLD as described in the system prompt.'
                }
              ]
            }
          ],
          output_config: {
            format: { type: 'json_schema', schema: buildExtractionJsonSchema(enabledComponentTypes) }
          }
        })
        message = await stream.finalMessage()
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) throw new AppError('AI_RATE_LIMITED')
        if (error instanceof Anthropic.AuthenticationError) throw new AppError('AI_INVALID_API_KEY')
        if (error instanceof Anthropic.APIConnectionError) throw new AppError('AI_UNREACHABLE')
        console.error('[ai:extractComponents:DEBUG]', error)
        throw new AppError('AI_REQUEST_FAILED')
      } finally {
        clearInterval(ticker)
      }

      onProgress?.({ pct: 92, stage: 'Parsing response' })

      if (message.stop_reason === 'max_tokens') {
        throw new AppError('AI_EXTRACTION_TRUNCATED', {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens
        })
      }

      const textBlock = message.content.find(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      )
      if (!textBlock) {
        throw new AppError('AI_RESPONSE_UNREADABLE', {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens
        })
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(textBlock.text)
      } catch {
        throw new AppError('AI_RESPONSE_UNREADABLE', {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens
        })
      }
      const { components, flags, panels } = normalizeExtractionPayload(parsed)

      let totalUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      }

      onProgress?.({ pct: 95, stage: 'Verifying' })

      let verifyPct = 95
      const verifyTicker = setInterval(() => {
        verifyPct = Math.min(99, verifyPct + 1)
        onProgress?.({ pct: verifyPct, stage: 'Verifying' })
      }, PROGRESS_TICK_MS)

      try {
        const verificationStream = this.client.messages.stream({
          model: this.model,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'disabled' },
          system: buildVerificationSystemPrompt(
            enabledComponentTypes,
            catalogDescriptions,
            preferredBrands,
            customRules,
            components,
            flags
          ),
          messages: [
            {
              role: 'user',
              content: [
                ...pageContentBlocks,
                {
                  type: 'text',
                  text: 'Review the page images against the already-extracted list as described in the system prompt.'
                }
              ]
            }
          ],
          output_config: {
            format: { type: 'json_schema', schema: buildVerificationJsonSchema(enabledComponentTypes) }
          }
        })
        const verificationMessage = await verificationStream.finalMessage()
        totalUsage = {
          inputTokens: totalUsage.inputTokens + verificationMessage.usage.input_tokens,
          outputTokens: totalUsage.outputTokens + verificationMessage.usage.output_tokens
        }

        const verificationTextBlock = verificationMessage.content.find(
          (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
        )
        if (verificationTextBlock) {
          const verificationParsed = JSON.parse(verificationTextBlock.text)
          const { missedComponents, additionalFlags } = normalizeVerificationPayload(verificationParsed)
          components.push(...dedupeComponents(components, missedComponents))
          flags.push(...dedupeFlags(flags, additionalFlags))
        }
      } catch (error) {
        // Verification is an accuracy enhancement, not a hard requirement —
        // a failure here must never waste an already-successful first pass.
        console.error('[ai:verifyExtraction]', error)
      } finally {
        clearInterval(verifyTicker)
      }

      onProgress?.({ pct: 99, stage: 'Zooming into panels' })

      const panelsByPage = new Map<number, ExtractedPanel[]>()
      for (const panel of panels) {
        const list = panelsByPage.get(panel.pageNumber) ?? []
        list.push(panel)
        panelsByPage.set(panel.pageNumber, list)
      }

      for (const [pageNumber, pagePanels] of panelsByPage) {
        const renderedCrops: { panel: ExtractedPanel; base64Png: string }[] = []
        for (const panel of pagePanels) {
          if (!panel.boundingBox) continue
          try {
            const base64Png = await renderPdfPanelCrop(pdfDoc, pageNumber, panel.boundingBox)
            if (base64Png) renderedCrops.push({ panel, base64Png })
          } catch (error) {
            console.error('[ai:renderPdfPanelCrop]', pageNumber, panel.panelName, error)
          }
        }
        if (renderedCrops.length === 0) continue

        const cropContentBlocks = renderedCrops.flatMap(
          ({ panel, base64Png }): Anthropic.Messages.ContentBlockParam[] => [
            { type: 'text', text: `Page ${pageNumber} — Panel: ${panel.panelName}` },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Png } }
          ]
        )

        const pageComponents = components.filter((c) => c.pageNumber === pageNumber)
        const pageFlags = flags.filter((f) => f.pageNumber === pageNumber)

        try {
          const cropZoomStream = this.client.messages.stream({
            model: this.model,
            max_tokens: MAX_TOKENS,
            thinking: { type: 'disabled' },
            system: buildCropZoomSystemPrompt(
              enabledComponentTypes,
              catalogDescriptions,
              preferredBrands,
              customRules,
              pageComponents,
              pageFlags
            ),
            messages: [
              {
                role: 'user',
                content: [
                  ...cropContentBlocks,
                  {
                    type: 'text',
                    text: 'Review these zoomed panel crops against the already-extracted list as described in the system prompt.'
                  }
                ]
              }
            ],
            output_config: {
              format: { type: 'json_schema', schema: buildVerificationJsonSchema(enabledComponentTypes) }
            }
          })
          const cropZoomMessage = await cropZoomStream.finalMessage()
          totalUsage = {
            inputTokens: totalUsage.inputTokens + cropZoomMessage.usage.input_tokens,
            outputTokens: totalUsage.outputTokens + cropZoomMessage.usage.output_tokens
          }

          const cropZoomTextBlock = cropZoomMessage.content.find(
            (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
          )
          if (cropZoomTextBlock) {
            const cropZoomParsed = JSON.parse(cropZoomTextBlock.text)
            const { missedComponents, additionalFlags } = normalizeVerificationPayload(cropZoomParsed)
            components.push(...dedupeComponents(components, missedComponents))
            flags.push(...dedupeFlags(flags, additionalFlags))
          }
        } catch (error) {
          // Same policy as the verification pass: an enhancement failure
          // must never waste an already-successful extraction.
          console.error('[ai:cropZoomExtraction]', pageNumber, error)
        }
      }

      onProgress?.({ pct: 100, stage: 'Done' })

      return {
        model: this.model,
        components,
        flags,
        usage: totalUsage
      }
    } finally {
      await pdfDoc.destroy()
    }
  }
}

export async function testAnthropicApiKey(apiKey: string): Promise<TestApiKeyResult> {
  try {
    const client = new Anthropic({ apiKey })
    // Listing models is a cheap, zero-generation call — it only checks that
    // the key authenticates, without spending any output tokens. Walking
    // every page (via the SDK's async-iterable pagination) also gives the
    // caller the real, current model list to populate Settings > AI Model.
    const models: { id: string; label: string }[] = []
    for await (const model of client.models.list()) {
      models.push({ id: model.id, label: model.display_name })
    }
    return { ok: true, models }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: formatErrorCode('AI_RATE_LIMITED') }
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: formatErrorCode('AI_INVALID_API_KEY') }
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: formatErrorCode('AI_UNREACHABLE') }
    }
    console.error('[ai:testAnthropicApiKey]', error)
    return { ok: false, error: formatErrorCode('AI_KEY_TEST_FAILED') }
  }
}
