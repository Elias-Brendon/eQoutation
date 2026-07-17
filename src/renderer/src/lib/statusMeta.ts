import type { QuotationStatus, SldStatus } from '@shared/types/entities'

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
