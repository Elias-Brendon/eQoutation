import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

export interface ExtractionProgress {
  pct: number
  stage: string
}

export interface ExtractionResult {
  model: string
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
}

export interface ExtractParams {
  pdfBytes: Uint8Array
  filename: string
  enabledComponentTypes: string[]
  // Known catalog descriptions, given to the model as a reference glossary
  // so it phrases extracted descriptions toward terms the catalog matcher
  // can actually find, instead of free-form paraphrasing.
  catalogDescriptions: string[]
  onProgress?: (progress: ExtractionProgress) => void
}

export interface AIProvider {
  extractComponents(params: ExtractParams): Promise<ExtractionResult>
}
