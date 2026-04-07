import { useEffect } from 'react'
import { useStore } from '@/store'
import { toPersona } from '@/features/personas/persona-validators'

/**
 * Loads custom personas from disk on app startup and seeds the Zustand
 * store. Called once from AppLayout, alongside the other startup hooks.
 *
 * The hook is idempotent across React Strict Mode double-mounts via a
 * module-scope guard, matching the pattern used by useStartupAutoCompaction.
 *
 * Failures are non-fatal: if the disk read throws or returns invalid
 * data, the store keeps its initial empty `customPersonas` array and the
 * user's custom personas pane shows "No custom personas yet". The error
 * is logged to console so devs can spot a corrupted file, but it does
 * NOT block the rest of the app from rendering — personas are an
 * optional layer on top of the always-available built-ins.
 */

let hasRun = false

/** Test-only: reset the module-scope guard for repeated runs in tests. */
export function _resetStartupCustomPersonasForTests(): void {
  hasRun = false
}

interface PersonasAPI {
  personasLoad(): Promise<readonly Record<string, unknown>[]>
}

export function useStartupCustomPersonas(): void {
  const setCustomPersonas = useStore((s) => s.setCustomPersonas)

  useEffect(() => {
    if (hasRun) return
    hasRun = true

    const api = (window as { consiliumAPI?: PersonasAPI }).consiliumAPI
    if (api == null) return

    api
      .personasLoad()
      .then((rows) => {
        // Filter to entries with the minimum shape we need to render.
        // The main process already validates rows via isValidCustomPersona
        // before returning them, but we re-check here to defend against
        // a future drift between main-process and renderer schemas, and
        // to satisfy the type narrowing for the synthesizer.
        const valid = rows.filter(
          (r): r is { id: string; name: string; content: string } =>
            typeof r['id'] === 'string' &&
            typeof r['name'] === 'string' &&
            typeof r['content'] === 'string',
        )
        setCustomPersonas(valid.map((row) => toPersona(row)))
      })
      .catch((err) => {
        console.error('[startup] failed to load custom personas:', err)
      })
  }, [setCustomPersonas])
}
