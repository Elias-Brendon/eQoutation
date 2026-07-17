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

export interface QuotationLine {
  id: string
  description: string
  qty: number
  unitPrice: number
  matchStatus: 'matched' | 'unknown'
}

export interface Quotation {
  id: string
  sldId: string
  code: string
  status: QuotationStatus
  lines: QuotationLine[]
}

export interface Flag {
  id: string
  origin: FlagOrigin
  description: string
  status: FlagStatus
}
