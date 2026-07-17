import { create } from 'zustand'
import type { CenterTab } from '@shared/types/entities'

interface UiState {
  selectedProjectId: string | null
  selectedSldId: string | null
  selectedQuotationId: string | null
  activeTab: CenterTab
  selectProject: (projectId: string) => void
  selectSld: (sldId: string, quotationId: string | null) => void
  clearSld: () => void
  selectQuotation: (quotationId: string, sldId: string) => void
  setActiveTab: (tab: CenterTab) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectId: null,
  selectedSldId: null,
  selectedQuotationId: null,
  activeTab: 'pdf',
  selectProject: (projectId): void =>
    set({ selectedProjectId: projectId, selectedSldId: null, selectedQuotationId: null }),
  selectSld: (sldId, quotationId): void =>
    set({ selectedSldId: sldId, selectedQuotationId: quotationId }),
  clearSld: (): void => set({ selectedSldId: null, selectedQuotationId: null }),
  selectQuotation: (quotationId, sldId): void =>
    set({ selectedQuotationId: quotationId, selectedSldId: sldId, activeTab: 'quotation' }),
  setActiveTab: (tab): void => set({ activeTab: tab })
}))
