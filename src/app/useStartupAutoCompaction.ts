import { useEffect } from 'react'
import { useStore } from '@/store'
import { computeStartupAutoCompactionPlan } from './startup-auto-compaction'

/** Module-scope guard — run exactly once per app process */
let hasRun = false

interface ConfigLoadResult {
  readonly values: Record<string, unknown>
  readonly descriptions: Record<string, string>
}

interface ConfigAPI {
  configLoad(): Promise<ConfigLoadResult>
  configSave(config: Record<string, unknown>): Promise<void>
}

/** Test-only: reset the module-scope guard so tests can run the hook repeatedly. */
export function _resetStartupAutoCompactionForTests(): void {
  hasRun = false
}

/**
 * Loads the global auto-compaction default from config.json after keys finish
 * loading, validates that the referenced key still exists, and applies the
 * setting to both the global store field and the current session.
 *
 * If the saved key is no longer available (deleted, re-encrypted, etc.), the
 * global setting is disabled, written back to disk, and a warning is surfaced
 * so the user knows why auto-compaction turned off.
 *
 * All decision logic lives in `computeStartupAutoCompactionPlan` so it can be
 * unit-tested without React, Zustand, or Electron IPC.
 */
export function useStartupAutoCompaction(): void {
  const keysLoaded = useStore((s) => s.keysLoaded)

  useEffect(() => {
    if (!keysLoaded || hasRun) return
    hasRun = true

    const api = (window as { consiliumAPI?: ConfigAPI }).consiliumAPI
    if (api == null) return

    void (async () => {
      try {
        const data = await api.configLoad()
        const store = useStore.getState()
        const plan = computeStartupAutoCompactionPlan(
          data.values,
          store.keys.map((k) => k.id),
        )

        store.setGlobalAutoCompaction(plan.globalEnabled, plan.globalConfig)

        if (plan.sessionOverride !== null) {
          store.setAutoCompaction(plan.sessionOverride.enabled, plan.sessionOverride.config)
        }

        if (plan.warning !== null) {
          store.setAutoCompactionWarning(plan.warning)
        }

        if (plan.persistedUpdate !== null) {
          await api.configSave({
            ...data.values,
            ...plan.persistedUpdate,
          })
        }
      } catch {
        // Config load/save errors are non-fatal — auto-compaction just stays off
      }
    })()
  }, [keysLoaded])
}
