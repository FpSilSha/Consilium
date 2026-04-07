import { useEffect } from 'react'
import { useStore } from '@/store'
import { computeStartupAutoCompactionPlan } from './startup-auto-compaction'
import { isKnownPresetId, DEFAULT_PRESET_ID } from '@/features/chat/compile-presets'

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

        // Compile settings — load compileMaxTokens and compileModelConfig.
        // Validate the compile model's key still exists; if not, clear it
        // (no warning surfaced for compile — the user can re-pick on next
        // compile click without prior selection blocking them).
        const rawCompileMaxTokens = data.values['compileMaxTokens']
        if (typeof rawCompileMaxTokens === 'number' && rawCompileMaxTokens > 0) {
          store.setCompileMaxTokens(rawCompileMaxTokens)
        }

        const rawCompileConfig = data.values['compileModelConfig']
        // Track whether the disk needs to be cleaned up (validation failed
        // on a previously-saved config). Without this, the next launch
        // would re-read the stale config, re-fail validation, and re-clear
        // the store in a silent loop forever.
        let compileConfigNeedsDiskClear = false
        if (
          rawCompileConfig != null &&
          typeof rawCompileConfig === 'object' &&
          !Array.isArray(rawCompileConfig)
        ) {
          const cfg = rawCompileConfig as Record<string, unknown>
          if (
            typeof cfg['provider'] === 'string' &&
            typeof cfg['model'] === 'string' &&
            typeof cfg['keyId'] === 'string' &&
            store.keys.some((k) => k.id === cfg['keyId'])
          ) {
            store.setCompileModelConfig({
              provider: cfg['provider'],
              model: cfg['model'],
              keyId: cfg['keyId'],
            })
          } else {
            store.setCompileModelConfig(null)
            compileConfigNeedsDiskClear = true
          }
        }

        // Compile preset — load from disk, validate against the known
        // preset list, fall back to the default if unknown. If the saved
        // ID is unknown (e.g., a renamed preset in a future release), we
        // also clean up the disk so we don't re-validate the stale value
        // on every launch.
        const rawCompilePresetId = data.values['compilePresetId']
        let compilePresetIdNeedsDiskClear = false
        if (typeof rawCompilePresetId === 'string' && rawCompilePresetId !== '') {
          if (isKnownPresetId(rawCompilePresetId)) {
            store.setCompilePresetId(rawCompilePresetId)
          } else {
            // Unknown preset ID — fall back to default and clean up disk
            store.setCompilePresetId(DEFAULT_PRESET_ID)
            compilePresetIdNeedsDiskClear = true
          }
        }

        // Single disk write that bundles any pending updates from this run.
        // Avoids multiple configSave round-trips when several settings need
        // cleanup on the same launch.
        const diskUpdate: Record<string, unknown> = {}
        if (plan.persistedUpdate !== null) {
          Object.assign(diskUpdate, plan.persistedUpdate)
        }
        if (compileConfigNeedsDiskClear) {
          diskUpdate['compileModelConfig'] = null
        }
        if (compilePresetIdNeedsDiskClear) {
          diskUpdate['compilePresetId'] = DEFAULT_PRESET_ID
        }
        if (Object.keys(diskUpdate).length > 0) {
          await api.configSave({
            ...data.values,
            ...diskUpdate,
          })
        }
      } catch {
        // Config load/save errors are non-fatal — auto-compaction just stays off
      }
    })()
  }, [keysLoaded])
}
