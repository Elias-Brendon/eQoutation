import OpenAI from 'openai'
import type { AIProvider, ExtractParams, ExtractionResult } from './AIProvider'
import { buildExtractionJsonSchema, normalizeExtractionPayload } from './extractionSchema'
import { buildExtractionSystemPrompt } from './promptTemplates'
import { renderPdfPagesToImages } from './pdfRenderer'
import { AppError } from '../errors/AppError'
import { formatErrorCode } from '@shared/errors/errorCodes'
import type { TestApiKeyResult } from '@shared/types/entities'

// Same budget as ClaudeProvider, same reason: dense multi-page SLDs (many
// components + notes + flags) can need well more than a few thousand
// output tokens — too low a budget truncates the JSON mid-string instead
// of raising a clear error, regardless of which provider is answering.
// Non-streaming means a large response here risks an HTTP timeout against
// a slow backend — a known, accepted limitation of this first pass, not
// something worked around by capping the budget instead (that would just
// trade a timeout risk for a truncation risk).
const MAX_TOKENS = 64000

const PROGRESS_TICK_MS = 400
const PROGRESS_TICK_CAP = 90

export class OpenAiCompatibleProvider implements AIProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl })
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
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pages = await renderPdfPagesToImages(pdfBytes)
    } catch (error) {
      console.error('[ai:openaiCompatible:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }

    onProgress?.({ pct: 15, stage: 'Sending to model' })

    let pct = 20
    const ticker = setInterval(() => {
      pct = Math.min(PROGRESS_TICK_CAP, pct + 3)
      onProgress?.({ pct, stage: 'Analyzing diagram' })
    }, PROGRESS_TICK_MS)

    const pageContentBlocks = pages.flatMap(
      (page): OpenAI.Chat.Completions.ChatCompletionContentPart[] => [
        { type: 'text', text: `Page ${page.pageNumber}` },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${page.base64Png}` } }
      ]
    )

    let completion: OpenAI.Chat.Completions.ChatCompletion
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: buildExtractionSystemPrompt(
              enabledComponentTypes,
              catalogDescriptions,
              preferredBrands,
              customRules
            )
          },
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
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'sld_extraction',
            schema: buildExtractionJsonSchema(enabledComponentTypes),
            strict: true
          }
        }
      })
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) throw new AppError('AI_RATE_LIMITED')
      if (error instanceof OpenAI.AuthenticationError) throw new AppError('AI_INVALID_API_KEY')
      if (error instanceof OpenAI.APIConnectionError) throw new AppError('AI_UNREACHABLE')
      console.error('[ai:openaiCompatible:extractComponents]', error)
      throw new AppError('AI_REQUEST_FAILED')
    } finally {
      clearInterval(ticker)
    }

    onProgress?.({ pct: 92, stage: 'Parsing response' })

    const usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0
    }

    if (completion.choices[0]?.finish_reason === 'length') {
      throw new AppError('AI_EXTRACTION_TRUNCATED', usage)
    }

    const text = completion.choices[0]?.message?.content
    if (!text) {
      throw new AppError('AI_RESPONSE_UNREADABLE', usage)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new AppError('AI_RESPONSE_UNREADABLE', usage)
    }
    const { components, flags } = normalizeExtractionPayload(parsed)

    onProgress?.({ pct: 100, stage: 'Done' })

    return {
      model: this.model,
      components,
      flags,
      usage
    }
  }
}

export async function testOpenAiCompatibleApiKey(
  apiKey: string,
  baseUrl: string
): Promise<TestApiKeyResult> {
  try {
    const client = new OpenAI({ apiKey, baseURL: baseUrl })
    // Cheap, zero-generation call — only checks that the key/endpoint
    // authenticate. Unlike the Anthropic path, results aren't cached or
    // shown anywhere (this provider's model field is free text).
    await client.models.list()
    return { ok: true }
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      return { ok: false, error: formatErrorCode('AI_RATE_LIMITED') }
    }
    if (error instanceof OpenAI.AuthenticationError) {
      return { ok: false, error: formatErrorCode('AI_INVALID_API_KEY') }
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return { ok: false, error: formatErrorCode('AI_UNREACHABLE') }
    }
    console.error('[ai:testOpenAiCompatibleApiKey]', error)
    return { ok: false, error: formatErrorCode('AI_KEY_TEST_FAILED') }
  }
}
