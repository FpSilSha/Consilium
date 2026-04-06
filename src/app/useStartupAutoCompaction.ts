import { useEffect } from 'react'
import { useStore } from '@/store'

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

function isValidAutoCompactionConfig(v: unknown): v is { provider: string; model: string; keyId: string } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o['provider'] === 'string'
    && typeof o['model'] === 'string'
    && typeof o['keyId'] === 'string'
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
 * Why wait for keys: we need the keys array to validate the saved keyId. The
 * current session's initializeNewSession runs earlier (before keys load), so
 * we apply global → current session here as a one-shot patch.
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
        const rawEnabled = data.values['autoCompactionEnabled']
        const rawConfig = data.values['autoCompactionConfig']

        const enabled = typeof rawEnabled === 'boolean' ? rawEnabled : false
        const config = isValidAutoCompactionConfig(rawConfig) ? rawConfig : null

        const store = useStore.getState()

        // Nothing to do if global was off to begin with
        if (!enabled || config === null) {
          store.setGlobalAutoCompaction(false, null)
          return
        }

        // Validate the referenced key still exists
        const keyStillExists = store.keys.some((k) => k.id === config.keyId)
        if (!keyStillExists) {
          store.setGlobalAutoCompaction(false, null)
          store.setAutoCompaction(false, null)
          store.setAutoCompactionWarning(
            'Auto-compaction was turned off — the previously selected key/model is no longer available. Pick a new one to re-enable.',
          )
          // Persist the disabled state so we don't warn again on next launch
          await api.configSave({
            ...data.values,
            autoCompactionEnabled: false,
            autoCompactionConfig: null,
          })
          return
        }

        // Key is valid — apply to global AND current session
        store.setGlobalAutoCompaction(true, config)
        store.setAutoCompaction(true, config)
      } catch {
        // Config load/save errors are non-fatal — auto-compaction just stays off
      }
    })()
  }, [keysLoaded])
}
