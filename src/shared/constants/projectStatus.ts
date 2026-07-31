import type { ProjectStatus } from '../types/entities'

// Shared between the renderer (Details modal dropdown) and the main
// process (Excel cover sheet), which is why this lives in shared/ rather
// than the renderer-only src/renderer/src/lib/statusMeta.ts.
export const PROJECT_STATUSES: ProjectStatus[] = [
  'generating',
  'pending_review',
  'approved',
  'rejected'
]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  generating: 'Generating…',
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected'
}
