import type { Flag, Project, Quotation, Sld } from '@shared/types/entities'

export const mockProject: Project = {
  id: 'proj-1',
  name: 'Substation A — Phase 2',
  substationLabel: 'Line Diagram Review',
  aiProgressPct: 63
}

export const mockSlds: Sld[] = [
  {
    id: 'sld-14',
    projectId: 'proj-1',
    filename: 'SLD-014.pdf',
    sectionGroup: 'Substation A — Phase 2',
    status: 'done'
  },
  {
    id: 'sld-15',
    projectId: 'proj-1',
    filename: 'SLD-015.pdf',
    sectionGroup: 'Substation A — Phase 2',
    status: 'in_progress'
  },
  {
    id: 'sld-16',
    projectId: 'proj-1',
    filename: 'SLD-016.pdf',
    sectionGroup: 'Substation A — Phase 2',
    status: 'rejected'
  },
  {
    id: 'sld-22',
    projectId: 'proj-1',
    filename: 'SLD-022.pdf',
    sectionGroup: 'Substation B — Feeder Yard',
    status: 'in_progress'
  },
  {
    id: 'sld-23',
    projectId: 'proj-1',
    filename: 'SLD-023.pdf',
    sectionGroup: 'Substation B — Feeder Yard',
    status: 'done'
  }
]

export const mockQuotations: Quotation[] = [
  {
    id: 'q-014',
    sldId: 'sld-14',
    code: 'Q-2024-014',
    status: 'approved',
    lines: [
      { id: 'l1', description: 'MCCB 250A 3P', qty: 2, unitPrice: 145.5, matchStatus: 'matched' },
      {
        id: 'l2',
        description: 'Busbar copper 40x10mm',
        qty: 6,
        unitPrice: 22.1,
        matchStatus: 'matched'
      }
    ]
  },
  {
    id: 'q-015',
    sldId: 'sld-15',
    code: 'Q-2024-015',
    status: 'pending_review',
    lines: [
      { id: 'l3', description: 'Contactor 32A', qty: 4, unitPrice: 38.75, matchStatus: 'matched' }
    ]
  },
  {
    id: 'q-016',
    sldId: 'sld-16',
    code: 'Q-2024-016',
    status: 'rejected',
    lines: [
      { id: 'l4', description: 'Voltage relay 415V', qty: 1, unitPrice: 0, matchStatus: 'unknown' }
    ]
  },
  { id: 'q-022', sldId: 'sld-22', code: 'Q-2024-022', status: 'generating', lines: [] },
  {
    id: 'q-023',
    sldId: 'sld-23',
    code: 'Q-2024-023',
    status: 'approved',
    lines: [
      {
        id: 'l5',
        description: 'Isolator switch 100A',
        qty: 3,
        unitPrice: 61.2,
        matchStatus: 'matched'
      }
    ]
  }
]

export const mockFlags: Flag[] = [
  { id: 'f1', origin: 'ai', description: 'Voltage label mismatch on SLD-016', status: 'open' },
  { id: 'f2', origin: 'ai', description: 'Quantity differs from BOM on SLD-016', status: 'open' },
  { id: 'f3', origin: 'ai', description: 'Unrecognized breaker tag on SLD-022', status: 'open' },
  {
    id: 'f4',
    origin: 'human',
    description: 'Missing breaker tag noted by reviewer',
    status: 'open'
  },
  { id: 'f5', origin: 'human', description: 'Confirm feeder yard voltage class', status: 'open' }
]
