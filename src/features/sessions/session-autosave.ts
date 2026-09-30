import { useStore } from '@/store'
import { buildSessionPayload, saveCurrentSession } from './session-manager'
import { isSessionLoading } from './session-loading'
import { sameSessionSnapshot, sessionSnapshot } from './session-snapshot'

const DEBOUNCE_MS = 2_000

/** Store subscription shared by the React hook and persistence regression tests. */
export function startSessionAutoSave() {
  let previous = sessionSnapshot(useStore.getState())
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const schedule = () => {
    cancel()
    const sessionId = useStore.getState().currentSessionId
    if (isSessionLoading() || sessionId === null) return
    timer = setTimeout(() => {
      timer = null
      if (!isSessionLoading() && useStore.getState().currentSessionId === sessionId) {
        saveCurrentSession().catch(() => {})
      }
    }, DEBOUNCE_MS)
  }

  const unsubscribe = useStore.subscribe((state) => {
    const next = sessionSnapshot(state)
    const changed = !sameSessionSnapshot(previous, next)
    previous = next
    if (isSessionLoading()) {
      cancel()
    } else if (changed) {
      schedule()
    }
  })
  // Re-arm on mount, including React StrictMode's setup-cleanup-setup cycle.
  schedule()

  return {
    flush: () => {
      cancel()
      if (isSessionLoading() || useStore.getState().currentSessionId === null) return
      const payload = buildSessionPayload()
      if (payload === null) return
      const api = (window as { consiliumAPI?: {
        sessionSaveSync(id: string, content: string): boolean
      } }).consiliumAPI
      api?.sessionSaveSync(payload.id, payload.content)
    },
    dispose: () => {
      cancel()
      unsubscribe()
    },
  }
}
