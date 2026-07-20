import { create } from 'zustand'
import type { CenterTab, ExtractionProgressEvent } from '@shared/types/entities'

interface UiState {
  selectedProjectId: string | null
  selectedSldId: string | null
  selectedQuotationId: string | null
  activeTab: CenterTab
  // Ephemeral, not persisted — live progress for whichever SLD is currently
  // being extracted, sourced from the ai:extractionProgress IPC push.
  extractionProgress: ExtractionProgressEvent | null
  selectProject: (projectId: string) => void
  selectSld: (sldId: string, quotationId: string | null) => void
  clearSld: () => void
  selectQuotation: (quotationId: string, sldId: string) => void
  setActiveTab: (tab: CenterTab) => void
  setExtractionProgress: (progress: ExtractionProgressEvent | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectId: null,
  selectedSldId: null,
  selectedQuotationId: null,
  activeTab: 'pdf',
  extractionProgress: null,
  selectProject: (projectId): void =>
    set({ selectedProjectId: projectId, selectedSldId: null, selectedQuotationId: null }),
  selectSld: (sldId, quotationId): void =>
    set({ selectedSldId: sldId, selectedQuotationId: quotationId }),
  clearSld: (): void => set({ selectedSldId: null, selectedQuotationId: null }),
  selectQuotation: (quotationId, sldId): void =>
    set({ selectedQuotationId: quotationId, selectedSldId: sldId, activeTab: 'quotation' }),
  setActiveTab: (tab): void => set({ activeTab: tab }),
  setExtractionProgress: (progress): void => set({ extractionProgress: progress })
}))
