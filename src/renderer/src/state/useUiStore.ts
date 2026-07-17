import { create } from 'zustand'
import type { CenterTab } from '@shared/types/entities'

interface UiState {
  selectedSldId: string | null
  selectedQuotationId: string | null
  activeTab: CenterTab
  selectSld: (sldId: string, quotationId: string | null) => void
  selectQuotation: (quotationId: string, sldId: string) => void
  setActiveTab: (tab: CenterTab) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedSldId: null,
  selectedQuotationId: null,
  activeTab: 'pdf',
  selectSld: (sldId, quotationId): void =>
    set({ selectedSldId: sldId, selectedQuotationId: quotationId }),
  selectQuotation: (quotationId, sldId): void =>
    set({ selectedQuotationId: quotationId, selectedSldId: sldId, activeTab: 'quotation' }),
  setActiveTab: (tab): void => set({ activeTab: tab })
}))
