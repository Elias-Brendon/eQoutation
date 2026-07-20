import type { FlagOrigin, FlagSeverity, QuotationStatus, SldStatus } from '@shared/types/entities'

export const sldStatusMeta: Record<
  SldStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  done: { label: 'Done', tone: 'success' },
  in_progress: { label: 'In Progress', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' }
}

export const quotationStatusMeta: Record<
  QuotationStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }
> = {
  generating: { label: 'Generating…', tone: 'info' },
  pending_review: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' }
}

export const flagOriginMeta: Record<
  FlagOrigin,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }
> = {
  matcher: { label: 'Matcher', tone: 'warning' },
  ai: { label: 'AI', tone: 'danger' },
  human: { label: 'Human', tone: 'warning' }
}

export const flagSeverityMeta: Record<
  FlagSeverity,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }
> = {
  info: { label: 'Info', tone: 'info' },
  warning: { label: 'Warning', tone: 'warning' }
}
