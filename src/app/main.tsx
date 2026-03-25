import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadPersistedKeys } from '@/features/keys/key-loader'
import { installGlobalErrorHandlers, safeLog } from '@/features/errorHandling'
import './app.css'

// Install global error handlers that redact API keys from error output
installGlobalErrorHandlers()

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Root element not found')
}

// Load persisted encrypted keys before rendering
loadPersistedKeys().catch((err: unknown) => {
  safeLog('warn', '[key-loader] Failed to load persisted keys:', err)
}).finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
