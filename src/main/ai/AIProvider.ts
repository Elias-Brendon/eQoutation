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
  onProgress?: (progress: ExtractionProgress) => void
}

export interface AIProvider {
  extractComponents(params: ExtractParams): Promise<ExtractionResult>
}
