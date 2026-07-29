import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

export interface ExtractionProgress {
  pct: number
  stage: string
}

export interface ExtractionResult {
  model: string
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface ExtractParams {
  pdfBytes: Uint8Array
  filename: string
  enabledComponentTypes: string[]
  // Known catalog descriptions, given to the model as a reference glossary
  // so it phrases extracted descriptions toward terms the catalog matcher
  // can actually find, instead of free-form paraphrasing.
  catalogDescriptions: string[]
  // Settings > Preferred Brands — biases both the glossary ordering and an
  // explicit prompt instruction toward these manufacturers when a drawing
  // is ambiguous. Defaults to no preference when empty.
  preferredBrands: string[]
  // Settings > Extraction Rules — free-text company-specific rules appended
  // to the prompt alongside the built-in ones.
  customRules: string[]
  onProgress?: (progress: ExtractionProgress) => void
}

export interface AIProvider {
  extractComponents(params: ExtractParams): Promise<ExtractionResult>
}
