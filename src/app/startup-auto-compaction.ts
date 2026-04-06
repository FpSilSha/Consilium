/**
 * Pure logic for the auto-compaction startup check.
 *
 * Extracted from useStartupAutoCompaction so it can be unit-tested without
 * React, Zustand, or Electron IPC. The hook calls this function with the
 * config values it loaded + the keys that are currently available, and the
 * function returns a plan describing what the hook should apply to the store
 * and what (if anything) needs to be persisted back to config.json.
 */

export interface AutoCompactionConfig {
  readonly provider: string
  readonly model: string
  readonly keyId: string
}

export interface StartupAutoCompactionPlan {
  /** What to set as the global default in the store. */
  readonly globalEnabled: boolean
  readonly globalConfig: AutoCompactionConfig | null
  /** What to apply to the current session. `null` means leave the session alone. */
  readonly sessionOverride: {
    readonly enabled: boolean
    readonly config: AutoCompactionConfig | null
  } | null
  /** User-facing warning, or null if nothing to warn about. */
  readonly warning: string | null
  /** If non-null, the hook should write this back to config.json. */
  readonly persistedUpdate: {
    readonly autoCompactionEnabled: boolean
    readonly autoCompactionConfig: AutoCompactionConfig | null
  } | null
}

function isValidAutoCompactionConfig(v: unknown): v is AutoCompactionConfig {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o['provider'] === 'string'
    && typeof o['model'] === 'string'
    && typeof o['keyId'] === 'string'
}

/**
 * Computes the startup plan from loaded config values and available key IDs.
 *
 * Cases:
 * - Config missing fields or explicitly off → global=off, no warning, no writes
 * - Config on but malformed (not a valid shape) → treat as off, write back the
 *   cleaned value so next launch is consistent
 * - Config on with valid shape, key still exists → apply to global AND session
 * - Config on with valid shape, key NOT in available list → disable global,
 *   clear session, emit warning, persist the disabled state so we don't warn
 *   again next launch
 */
export function computeStartupAutoCompactionPlan(
  configValues: Record<string, unknown>,
  availableKeyIds: readonly string[],
): StartupAutoCompactionPlan {
  const rawEnabled = configValues['autoCompactionEnabled']
  const rawConfig = configValues['autoCompactionConfig']

  const enabled = typeof rawEnabled === 'boolean' ? rawEnabled : false

  // Config was off (or field absent) — nothing to do beyond setting global=off
  if (!enabled) {
    return {
      globalEnabled: false,
      globalConfig: null,
      sessionOverride: null,
      warning: null,
      persistedUpdate: null,
    }
  }

  // Enabled but config shape is invalid — clean up and persist
  if (!isValidAutoCompactionConfig(rawConfig)) {
    return {
      globalEnabled: false,
      globalConfig: null,
      sessionOverride: null,
      warning: null,
      persistedUpdate: {
        autoCompactionEnabled: false,
        autoCompactionConfig: null,
      },
    }
  }

  // Enabled with valid shape — validate key existence
  const keyStillExists = availableKeyIds.includes(rawConfig.keyId)
  if (!keyStillExists) {
    return {
      globalEnabled: false,
      globalConfig: null,
      sessionOverride: { enabled: false, config: null },
      warning:
        'Auto-compaction was turned off — the previously selected key/model is no longer available. Pick a new one to re-enable.',
      persistedUpdate: {
        autoCompactionEnabled: false,
        autoCompactionConfig: null,
      },
    }
  }

  // All good — apply to global AND patch current session
  return {
    globalEnabled: true,
    globalConfig: rawConfig,
    sessionOverride: { enabled: true, config: rawConfig },
    warning: null,
    persistedUpdate: null,
  }
}
