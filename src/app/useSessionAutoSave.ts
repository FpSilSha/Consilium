import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { saveCurrentSession, buildSessionPayload } from '@/features/sessions/session-manager'

const DEBOUNCE_MS = 2_000

/** Module-scope flag to suppress auto-save during session load */
let isLoadingSession = false

export function setSessionLoadingFlag(loading: boolean): void {
  isLoadingSession = loading
}

/**
 * Auto-saves the current session when messages or advisors change.
 * Creates a new session on the first message, then saves on subsequent changes.
 * Debounced to avoid excessive writes during streaming.
 * Suppressed during session load to prevent overwriting restored data.
 *
 * Also registers a beforeunload handler to flush pending saves
 * immediately on app close using synchronous IPC + atomic writes.
 */
export function useSessionAutoSave(): void {
  const messageCount = useStore((s) => s.messages.length)
  const windowCount = useStore((s) => s.windowOrder.length)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevKeyRef = useRef('')

  useEffect(() => {
    // Don't save empty sessions
    if (messageCount === 0 && windowCount === 0) return

    // Don't save during session load
    if (isLoadingSession) return

    // Don't save if nothing changed
    const key = `${messageCount}_${windowCount}`
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    // Debounce
    if (timerRef.current != null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!isLoadingSession) {
        saveCurrentSession().catch(() => {})
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current)
    }
  }, [messageCount, windowCount])

  // Flush on beforeunload — cancels pending debounce and writes synchronously
  useEffect(() => {
    const handler = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      const state = useStore.getState()
      if (state.messages.length === 0 && state.windowOrder.length === 0) return

      const payload = buildSessionPayload()
      if (payload == null) return

      const api = (window as { consiliumAPI?: { sessionSaveSync(id: string, content: string): boolean } }).consiliumAPI
      api?.sessionSaveSync(payload.id, payload.content)
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}
