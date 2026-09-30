import { useEffect } from 'react'
import { startSessionAutoSave } from '@/features/sessions/session-autosave'

/** Debounced persistence of session changes, with a synchronous close-time flush. */
export function useSessionAutoSave(): void {
  useEffect(() => {
    const autosave = startSessionAutoSave()
    window.addEventListener('beforeunload', autosave.flush)
    return () => {
      window.removeEventListener('beforeunload', autosave.flush)
      autosave.dispose()
    }
  }, [])
}
