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
        // We still reject empty string and null/undefined so garbage
        // data doesn't leak into the store. The dead disk-clear
        // branch was removed along with DEFAULT_PRESET_ID import —
        // any future re-tightening should re-import DEFAULT_PRESET_ID
        // rather than hardcoding a magic string.
        const rawCompilePresetId = data.values['compilePresetId']
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
        // (Removed: the compilePresetId self-heal on startup. With
        // custom prompts now layered on top, the startup validator
        // can't know whether a saved ID is a deleted custom or a
        // still-loading custom. Runtime resolution handles the
        // unknown-ID case via resolveCompilePromptWithFallback, and
        // CompilePromptsPane self-heals the global default when
        // the user explicitly deletes a custom that's currently
        // selected. Startup no longer touches compilePresetId.)
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
