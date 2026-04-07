import { type ReactNode, useState, useEffect, useCallback, useRef } from 'react'
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'
import { withTimeout } from '@/features/configuration/with-timeout'

/**
 * Advanced (raw JSON) pane — generic key/value editor for AppConfig
 * fields that don't have a dedicated pane. Ported from the standalone
 * EditConfigModal as the seventh and final native pane in
 * ConfigurationModal.
 *
 * The pane only edits fields NOT listed in HIDDEN_KEYS. Hidden fields
 * are persisted on disk but managed by other panes (Compile, Auto-
 * compaction, Personas, System Prompts, Compile Prompts, Compact
 * Prompts) — letting the raw editor touch them would bypass each
 * pane's store mirror, leaving the in-memory store and disk out of
 * sync until next launch.
 *
 * The save flow is disk-only (no store mirror) because every
 * editable field is a "primitive" config setting that the runtime
 * code reads directly from config.json on next launch — there's no
 * Zustand mirror to update. If a future field becomes store-mirrored,
 * it MUST be added to HIDDEN_KEYS and given its own pane.
 */

interface ConfigData {
  readonly values: Record<string, unknown>
  readonly descriptions: Record<string, string>
}

/**
 * Config keys that have dedicated panes elsewhere in ConfigurationModal
 * and shouldn't be raw-edited via this generic editor. They're persisted
 * in config.json but not surfaced here.
 *
 * Why hidden, not just JSON-blob fields:
 * - autoCompactionEnabled / autoCompactionConfig: edited via the
 *   Auto-compaction pane which mirrors the value into the Zustand
 *   store. This raw editor only writes to disk, so editing a
 *   store-mirrored field here would leave store and disk out of sync
 *   until the next app launch (silent settings rot).
 * - compileModelConfig / compileMaxTokens / compilePresetId: same
 *   reason — owned by the Compile pane.
 * - advisorSystemPromptMode / advisorSystemPromptCustomId /
 *   personaSwitchPromptMode / personaSwitchPromptCustomId: owned by
 *   the System Prompts pane.
 * - compactPromptId: owned by the Compact Prompts pane.
 *
 * Rule of thumb: if the field is mirrored in the store and read from
 * the store at runtime, it MUST be hidden from this pane until/unless
 * the raw editor learns to push values back into the store.
 */
const HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'autoCompactionEnabled',
  'autoCompactionConfig',
  'compileModelConfig',
  'compileMaxTokens',
  'compilePresetId',
  'advisorSystemPromptMode',
  'advisorSystemPromptCustomId',
  'personaSwitchPromptMode',
  'personaSwitchPromptCustomId',
  'compactPromptId',
])

/**
 * Per-field validation limits for number inputs. Each entry is a
 * (min, max) pair the validator enforces in addition to
 * `Number.isFinite`. Fields not listed here use the conservative
 * default of `(1, Number.MAX_SAFE_INTEGER)` — i.e., positive, finite,
 * any reasonable size.
 *
 * Why per-field caps:
 *   - maxSessionSizeMB = 0 silently breaks ALL session saves (the
 *     main process check rejects every save as exceeding 0 MB).
 *     Capping at 1 (min) and 10000 (max, 10 GB) leaves headroom for
 *     unusual users without allowing the silent-brick footgun.
 *   - maxFileAttachmentMB = 0 blocks all attachments. Cap at 1 / 1000
 *     for the same reason as maxSessionSizeMB.
 *
 * The default min of 1 catches the empty-input case (which JavaScript
 * coerces to 0 via `Number('')`).
 */
const NUMBER_FIELD_LIMITS: Readonly<Record<string, { readonly min: number; readonly max: number }>> = {
  maxSessionSizeMB: { min: 1, max: 10_000 },
  maxFileAttachmentMB: { min: 1, max: 1_000 },
}

/**
 * Fields whose changes take effect on the NEXT app launch rather
 * than immediately. Surfaces as a more accurate "restart" hint in
 * the saved indicator instead of the blanket "some changes require
 * a restart" the original modal showed.
 */
const RESTART_REQUIRED_FIELDS: ReadonlySet<string> = new Set([
  // App.tsx reads showOnboarding into local React state at mount;
  // an in-memory appConfig update doesn't propagate back.
  'showOnboarding',
])

export function AdvancedPane(): ReactNode {
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedNeedsRestart, setSavedNeedsRestart] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dirty if any draft differs from the loaded config string
  // representation. Computed every render — `config` is small and
  // string compares are cheap. Returns false until the load resolves.
  const isDirty =
    config != null &&
    Object.entries(draft).some(([key, value]) => {
      const original = config.values[key]
      return value !== String(original ?? '')
    })

  const registerDirtyGuard = useRegisterDirtyGuard()
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved configuration changes?')
    })
    return () => registerDirtyGuard(null)
  }, [registerDirtyGuard])

  useEffect(() => {
    const api = getAPI()
    if (api == null) return
    // Symmetric with the save path: wrap configLoad in a timeout
    // so a hung main process can't leave the pane stuck on the
    // "Loading configuration..." text forever. The error surfaces
    // in the loading branch and the user can re-mount the pane
    // (switch tabs and back) to retry.
    withTimeout(api.configLoad(), 10_000, 'Load timed out')
      .then((data) => {
        setConfig(data)
        const initial: Record<string, string> = {}
        for (const [key, value] of Object.entries(data.values)) {
          if (HIDDEN_KEYS.has(key)) continue
          initial[key] = String(value)
        }
        setDraft(initial)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load configuration')
      })
  }, [])

  const handleChange = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (config == null) return

    const api = getAPI()
    if (api == null) {
      setError('Configuration API not available')
      return
    }

    setError(null)
    setSaved(false)
    setSavedNeedsRestart(false)

    // Track which fields actually changed in this save so the
    // success message can flag whether a restart is required.
    const changedFields = new Set<string>()
    for (const [key, value] of Object.entries(draft)) {
      if (value !== String(config.values[key] ?? '')) {
        changedFields.add(key)
      }
    }
    const needsRestart = Array.from(changedFields).some((k) => RESTART_REQUIRED_FIELDS.has(k))

    // Convert string values back to their original types. The main
    // process config:save handler is forgiving — it falls back to the
    // current in-memory appConfig.{field} when a key is omitted, so
    // hidden fields are preserved across saves.
    const newConfig: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(draft)) {
      const original = config.values[key]
      if (typeof original === 'number') {
        const num = Number(value)
        if (!Number.isFinite(num)) {
          setError(`Invalid value for ${key}: "${value}" (must be a finite number)`)
          return
        }
        // Apply per-field limits with a sane default. The default of
        // (1, MAX_SAFE_INTEGER) catches the empty-string-to-zero
        // case (Number('') === 0) for any unlisted field.
        const limits = NUMBER_FIELD_LIMITS[key] ?? { min: 1, max: Number.MAX_SAFE_INTEGER }
        if (num < limits.min || num > limits.max) {
          setError(
            `Invalid value for ${key}: "${value}" (must be between ${limits.min} and ${limits.max.toLocaleString()}).`,
          )
          return
        }
        newConfig[key] = Math.round(num)
      } else if (typeof original === 'boolean') {
        // Booleans are rendered as text inputs (yes/no/true/false).
        // Accept the obvious forms; reject anything else with a clear
        // message rather than silently coercing to false.
        const lower = value.trim().toLowerCase()
        if (lower === 'true' || lower === 'yes' || lower === '1') {
          newConfig[key] = true
        } else if (lower === 'false' || lower === 'no' || lower === '0') {
          newConfig[key] = false
        } else {
          setError(`Invalid value for ${key}: "${value}" (must be true/false/yes/no/1/0)`)
          return
        }
      } else {
        newConfig[key] = value
      }
    }

    setSaving(true)

    try {
      await withTimeout(api.configSave(newConfig), 10_000, 'Save timed out')
      // Re-seed config + draft from the canonical types we just
      // wrote. Without this, a value like "1.5" stays in the input
      // after Save (where the typed string differs from the rounded
      // integer that actually persisted) — silent semantic drift.
      // Updating both `config.values` and `draft` to the rounded
      // integer means the input visibly snaps to the saved value.
      const nextValues: Record<string, unknown> = { ...config.values, ...newConfig }
      setConfig({ ...config, values: nextValues })
      const nextDraft: Record<string, string> = {}
      for (const [key, value] of Object.entries(nextValues)) {
        if (HIDDEN_KEYS.has(key)) continue
        nextDraft[key] = String(value)
      }
      setDraft(nextDraft)
      setSaved(true)
      setSavedNeedsRestart(needsRestart)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [config, draft])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">Advanced</h3>
        <p className="mt-1 text-xs text-content-muted">
          Raw config.json editor for fields without a dedicated pane. Power-user only — use the
          dedicated panes (Compile, Auto-compaction, Personas, etc.) for managed settings.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {config == null ? (
          error != null ? (
            <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
              {error}
            </p>
          ) : (
            <p className="text-xs text-content-muted">Loading configuration…</p>
          )
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {Object.entries(config.values)
                .filter(([key]) => !HIDDEN_KEYS.has(key))
                .map(([key, originalValue]) => (
                  <div key={key}>
                    <label
                      htmlFor={`advanced-${key}`}
                      className="mb-0.5 block text-xs font-medium text-content-primary"
                    >
                      {key}
                    </label>
                    <p className="mb-1.5 text-[10px] text-content-disabled">
                      {config.descriptions[key] ?? ''}
                    </p>
                    {typeof originalValue === 'number' ? (
                      <input
                        id={`advanced-${key}`}
                        type="number"
                        value={draft[key] ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
                      />
                    ) : (
                      <input
                        id={`advanced-${key}`}
                        type="text"
                        value={draft[key] ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
                      />
                    )}
                  </div>
                ))}
            </div>

            {/* Footer — per-pane save. Save is disabled when there
                are no draft changes so the user can't accidentally
                round-trip an identical config to disk. */}
            <div className="mt-6 flex items-center justify-between border-t border-edge-subtle pt-3">
              <div className="text-[10px]">
                {error != null && <span className="text-error">{error}</span>}
                {saved && error == null && (
                  <span className="text-accent-green">
                    {savedNeedsRestart
                      ? 'Saved. Restart the app to apply the changes you made.'
                      : 'Saved. Changes take effect immediately.'}
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function getAPI() {
  if (typeof window === 'undefined') return null
  return (
    (window as {
      consiliumAPI?: {
        configLoad(): Promise<{
          values: Record<string, unknown>
          descriptions: Record<string, string>
        }>
        configSave(config: Record<string, unknown>): Promise<void>
      }
    }).consiliumAPI ?? null
  )
}
