import { redactKeys } from '@/features/keys/key-detection'

let installed = false

/**
 * Installs global error handlers that redact API keys from error messages
 * before they reach the console or any crash reporting system.
 *
 * Call once during app initialization. Idempotent — safe to call multiple times.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return
  installed = true

  // Catch unhandled errors — always intercept and redact
  window.addEventListener('error', (event) => {
    if (event.message != null) {
      event.preventDefault()
      const redactedMessage = redactKeys(event.message)
      const redactedStack = event.error instanceof Error && event.error.stack != null
        ? redactKeys(event.error.stack)
        : undefined
      // eslint-disable-next-line no-console
      console.error('[error]', redactedMessage, ...(redactedStack != null ? [redactedStack] : []))
    }
  })

  // Catch unhandled promise rejections — always intercept and redact
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault()
    const reason = event.reason

    if (reason instanceof Error) {
      const redactedMessage = redactKeys(reason.message)
      const redactedStack = reason.stack != null ? redactKeys(reason.stack) : undefined
      // eslint-disable-next-line no-console
      console.error('[rejection]', redactedMessage, ...(redactedStack != null ? [redactedStack] : []))
    } else if (typeof reason === 'string') {
      // eslint-disable-next-line no-console
      console.error('[rejection]', redactKeys(reason))
    } else {
      // Best-effort redaction for non-string, non-Error reasons (e.g., plain objects)
      try {
        const serialized = JSON.stringify(reason)
        // eslint-disable-next-line no-console
        console.error('[rejection]', redactKeys(serialized))
      } catch {
        // Circular reference or non-serializable — log type only
        // eslint-disable-next-line no-console
        console.error('[rejection]', typeof reason)
      }
    }
  })
}
