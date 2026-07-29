import { create } from 'zustand'

export interface ErrorToast {
  id: string
  message: string
}

interface ErrorToastState {
  toasts: ErrorToast[]
  pushError: (message: string) => void
  dismiss: (id: string) => void
}

// Global safety net: any query/mutation error not already handled inline by
// a component (see main.tsx's QueryClient error handlers) lands here so
// nothing fails silently. Skips adding a duplicate if the same message is
// already showing, so a repeated background-refetch failure doesn't stack
// identical toasts.
export const useErrorToastStore = create<ErrorToastState>((set, get) => ({
  toasts: [],
  pushError: (message): void => {
    if (get().toasts.some((toast) => toast.message === message)) return
    set((state) => ({ toasts: [...state.toasts, { id: crypto.randomUUID(), message }] }))
  },
  dismiss: (id): void => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
