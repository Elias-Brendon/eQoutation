import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, ExtractParams, ExtractionResult } from './AIProvider'
import { extractionJsonSchema, normalizeExtractionPayload } from './extractionSchema'
import { buildExtractionSystemPrompt } from './promptTemplates'
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
    filename,
    enabledComponentTypes,
    catalogDescriptions,
    onProgress
  }: ExtractParams): Promise<ExtractionResult> {
    onProgress?.({ pct: 5, stage: 'Reading PDF' })
    const base64 = Buffer.from(pdfBytes).toString('base64')

    onProgress?.({ pct: 15, stage: 'Sending to Claude' })

    let pct = 20
    const ticker = setInterval(() => {
      pct = Math.min(PROGRESS_TICK_CAP, pct + 3)
      onProgress?.({ pct, stage: 'Analyzing diagram' })
    }, PROGRESS_TICK_MS)

    let message: Anthropic.Messages.Message
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        // Extended thinking is on by default for this model and, left
        // unbounded, consumes the entire token budget before any structured
        // output is emitted. This task needs the budget spent on output.
        thinking: { type: 'disabled' },
        system: buildExtractionSystemPrompt(enabledComponentTypes, catalogDescriptions),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                title: filename
              },
              {
                type: 'text',
                text: 'Extract every component from this switchboard SLD as described in the system prompt.'
              }
            ]
          }
        ],
        output_config: { format: { type: 'json_schema', schema: extractionJsonSchema } }
      })
      message = await stream.finalMessage()
    } finally {
      clearInterval(ticker)
    }

    onProgress?.({ pct: 92, stage: 'Parsing response' })

    if (message.stop_reason === 'max_tokens') {
      throw new Error(
        `Claude's response was truncated at the ${MAX_TOKENS}-token output limit before finishing ` +
          'the JSON. This SLD likely has more components/detail than the budget allows — try again ' +
          'or split the diagram into fewer pages per extraction.'
      )
    }

    const textBlock = message.content.find(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    )
    if (!textBlock) {
      throw new Error('Claude response had no text content to parse')
    }

    const parsed = JSON.parse(textBlock.text)
    const { components, flags } = normalizeExtractionPayload(parsed)

    onProgress?.({ pct: 100, stage: 'Done' })

    return { model: this.model, components, flags }
  }
}

export async function testAnthropicApiKey(apiKey: string): Promise<TestApiKeyResult> {
  try {
    const client = new Anthropic({ apiKey })
    // Listing models is a cheap, zero-generation call — it only checks that
    // the key authenticates, without spending any output tokens.
    await client.models.list({ limit: 1 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
