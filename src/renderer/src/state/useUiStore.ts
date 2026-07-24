import { create } from 'zustand'
import type { ExtractionProgressEvent, PanelMode } from '@shared/types/entities'

interface UiState {
  selectedProjectId: string | null
  selectedSldId: string | null
  selectedQuotationId: string | null
  panelMode: PanelMode
  // Ephemeral, not persisted — live progress for whichever SLD is currently
  // being extracted, sourced from the ai:extractionProgress IPC push.
  extractionProgress: ExtractionProgressEvent | null
  selectProject: (projectId: string) => void
  selectSld: (sldId: string, quotationId: string | null) => void
  clearSld: () => void
  selectQuotation: (quotationId: string, sldId: string) => void
  clearQuotation: () => void
  setPanelMode: (mode: PanelMode) => void
  setExtractionProgress: (progress: ExtractionProgressEvent | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectId: null,
  selectedSldId: null,
  selectedQuotationId: null,
  panelMode: 'split',
  extractionProgress: null,
  selectProject: (projectId): void =>
    set({ selectedProjectId: projectId, selectedSldId: null, selectedQuotationId: null }),
  selectSld: (sldId, quotationId): void =>
    set({ selectedSldId: sldId, selectedQuotationId: quotationId, panelMode: 'split' }),
  clearSld: (): void => set({ selectedSldId: null, selectedQuotationId: null }),
  selectQuotation: (quotationId, sldId): void =>
    set({ selectedQuotationId: quotationId, selectedSldId: sldId, panelMode: 'quotation-full' }),
  clearQuotation: (): void => set({ selectedQuotationId: null }),
  setPanelMode: (mode): void => set({ panelMode: mode }),
  setExtractionProgress: (progress): void => set({ extractionProgress: progress })
}))
