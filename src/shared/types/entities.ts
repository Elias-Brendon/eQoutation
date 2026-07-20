export type SldStatus = 'done' | 'in_progress' | 'rejected'
export type QuotationStatus = 'generating' | 'pending_review' | 'approved' | 'rejected'
export type FlagOrigin = 'ai' | 'human'
export type FlagStatus = 'open' | 'resolved'
export type CenterTab = 'pdf' | 'quotation'

export interface Project {
  id: string
  name: string
  substationLabel: string
  aiProgressPct: number
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  substationLabel?: string
}

export interface Sld {
  id: string
  projectId: string
  filename: string
  filePath: string
  sectionGroup: string
  status: SldStatus
  createdAt: string
  updatedAt: string
}

export interface UploadSldInput {
  projectId: string
  sectionGroup?: string
}

export type QuotationLineMatchStatus = 'matched' | 'unknown'

export interface QuotationLine {
  id: string
  quotationId: string
  catalogItemId: string | null
  pageNumber: number
  tag: string
  description: string
  maker: string
  qty: number
  uom: string
  listPrice: number
  discountFactor: number
  unitCost: number
  totalCost: number
  margin: number
  quotePrice: number
  matchStatus: QuotationLineMatchStatus
  matchConfidence: number
}

export interface Quotation {
  id: string
  sldId: string
  extractionId: string | null
  code: string
  status: QuotationStatus
  excelFilePath: string | null
  lines: QuotationLine[]
  createdAt: string
  updatedAt: string
}

export interface Flag {
  id: string
  origin: FlagOrigin
  description: string
  status: FlagStatus
}

export type AnnotationShapeType = 'freehand' | 'pin'
export type AnnotationAuthorType = 'human' | 'ai'

export interface AnnotationPoint {
  x: number
  y: number
}

export interface Annotation {
  id: string
  sldId: string
  pageNumber: number
  authorType: AnnotationAuthorType
  shapeType: AnnotationShapeType
  points: AnnotationPoint[]
  color: string
  commentText: string | null
  createdAt: string
}

export interface CreateAnnotationInput {
  sldId: string
  pageNumber: number
  shapeType: AnnotationShapeType
  points: AnnotationPoint[]
  color: string
  commentText?: string
}

export interface CatalogItem {
  id: string
  sku: string
  description: string
  maker: string
  family: string
  series: string
  listPrice: number
  discountFactor: number
  unitPrice: number
  uom: string
  sourceRow: number | null
  updatedAt: string
}

export interface CatalogStatus {
  catalogDir: string
  sourcePath: string | null
  itemCount: number
  lastSyncedAt: string | null
}

export interface CatalogReloadResult {
  ok: boolean
  itemCount: number
  sourcePath: string | null
  error?: string
}

export type ExtractionStatus = 'running' | 'done' | 'error'
export type ExtractionFlagSeverity = 'info' | 'warning'

export interface ExtractedComponent {
  description: string
  qty: number
  uom: string
  tag: string
  pageNumber: number
  confidence: number
  notes: string
}

export interface ExtractionFlag {
  pageNumber: number
  message: string
  severity: ExtractionFlagSeverity
}

export interface Extraction {
  id: string
  sldId: string
  status: ExtractionStatus
  model: string | null
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface ExtractionProgressEvent {
  sldId: string
  pct: number
  stage: string
}
