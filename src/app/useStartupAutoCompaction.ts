import { useEffect } from 'react'
import { useStore } from '@/store'
import { computeStartupAutoCompactionPlan } from './startup-auto-compaction'
// DEFAULT_PRESET_ID is no longer used in this file — the compile preset
// validation was relaxed to accept any non-empty string so that saved
// custom preset IDs survive the startup race with the custom-prompts
// loader. See the comment near rawCompilePresetId for details. The
// runtime resolver in compile-prompts-resolver.ts handles the unknown-ID
// fallback.

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

        // Compile preset — load from disk and apply. Historical note:
        // this used to validate against isKnownPresetId (the base
        // COMPILE_PRESETS array only) and reset unknown IDs to the
        // default + clean disk. With the custom compile prompts
        // library now in play, an ID can refer to a custom entry that
        // hasn't been loaded yet (useStartupCustomCompilePrompts runs
        // independently and may not have resolved by the time this
        // validator runs). So we accept any non-empty string here and
        // let runtime resolution via resolveCompilePromptWithFallback
        // handle the "unknown at runtime" case. That resolver already
        // falls back to DEFAULT_PRESET_ID if the custom is missing.
        //
        // We still reject the empty string and null/undefined so
        // garbage data doesn't leak into the store — `isKnownPresetId`
        // is now used only as an "is non-empty string" gate here, not
        // as a membership test. A future migration could drop this
        // validator entirely once we're sure customs always load
        // before compile runs.
        const rawCompilePresetId = data.values['compilePresetId']
        const compilePresetIdNeedsDiskClear = false
        if (typeof rawCompilePresetId === 'string' && rawCompilePresetId !== '') {
          store.setCompilePresetId(rawCompilePresetId)
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
        // compilePresetIdNeedsDiskClear is always false since the
        // relaxation — kept as a dead branch so a future re-tightening
        // can restore the cleanup without restructuring the code. The
        // cast-to-never-fires is cheap and preserves intent.
        if (compilePresetIdNeedsDiskClear) {
          diskUpdate['compilePresetId'] = 'comprehensive'
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
