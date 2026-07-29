import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import App from './App'
import { ErrorToastContainer } from '@renderer/components/common/ErrorToastContainer'
import { useErrorToastStore } from '@renderer/state/useErrorToastStore'

// Global safety net: any query or mutation that fails and isn't otherwise
// handled inline by the component that triggered it surfaces here instead
// of failing silently. Error messages already arrive sanitized as
// "Error <CODE>: <explanation>" from the main process (see AppError).
function onQueryOrMutationError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  useErrorToastStore.getState().pushError(message)
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryOrMutationError }),
  mutationCache: new MutationCache({ onError: onQueryOrMutationError })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ErrorToastContainer />
    </QueryClientProvider>
  </StrictMode>
)
