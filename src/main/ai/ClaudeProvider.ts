import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, ExtractParams, ExtractionResult } from './AIProvider'
import { extractionJsonSchema, normalizeExtractionPayload } from './extractionSchema'
import { extractionSystemPrompt } from './promptTemplates'

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 8192

// There's no real token-level progress for a single non-streaming call, so
// this ticks a heuristic estimate up to a cap while the request is in
// flight — good enough for a live-feeling progress bar, not a precise ETA.
const PROGRESS_TICK_MS = 400
const PROGRESS_TICK_CAP = 88

export class ClaudeProvider implements AIProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async extractComponents({
    pdfBytes,
    filename,
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
      message = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Extended thinking is on by default for this model and, left
        // unbounded, consumes the entire token budget before any structured
        // output is emitted. This task needs the budget spent on output.
        thinking: { type: 'disabled' },
        system: extractionSystemPrompt,
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
    } finally {
      clearInterval(ticker)
    }

    onProgress?.({ pct: 92, stage: 'Parsing response' })

    const textBlock = message.content.find(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    )
    if (!textBlock) {
      throw new Error('Claude response had no text content to parse')
    }

    const parsed = JSON.parse(textBlock.text)
    const { components, flags } = normalizeExtractionPayload(parsed)

    onProgress?.({ pct: 100, stage: 'Done' })

    return { model: MODEL, components, flags }
  }
}
