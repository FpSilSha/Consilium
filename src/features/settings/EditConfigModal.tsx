import { type ReactNode, useState, useEffect, useCallback } from 'react'

interface ConfigData {
  readonly values: Record<string, unknown>
  readonly descriptions: Record<string, string>
}

/**
 * Config keys that have dedicated UI elsewhere and shouldn't be raw-edited
 * via the generic configuration editor. They're persisted in config.json
 * but not surfaced here.
 *
 * Note: `compileMaxTokens` is intentionally NOT in this list. It has a
 * dedicated UI in the Compile Settings modal, but it's a plain number so
 * editing the raw value here is also safe. Two paths to the same setting;
 * users find whichever first.
 */
const HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'autoCompactionEnabled',
  'autoCompactionConfig',
  'compileModelConfig',
])

interface EditConfigModalProps {
  readonly onClose: () => void
}

export function EditConfigModal({ onClose }: EditConfigModalProps): ReactNode {
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = getAPI()
    if (api == null) return
    api.configLoad().then((data) => {
      setConfig(data)
      const initial: Record<string, string> = {}
      for (const [key, value] of Object.entries(data.values)) {
        if (HIDDEN_KEYS.has(key)) continue
        initial[key] = String(value)
      }
      setDraft(initial)
    }).catch(() => {})
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

    // Convert string values back to their original types
    const newConfig: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(draft)) {
      const original = config.values[key]
      if (typeof original === 'number') {
        const num = Number(value)
        if (!Number.isFinite(num) || num < 0) {
          setError(`Invalid value for ${key}: "${value}" (must be a non-negative number)`)
          return
        }
        newConfig[key] = Math.round(num)
      } else {
        newConfig[key] = value
      }
    }

    setSaving(true)

    try {
      await api.configSave(newConfig)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [config, draft])

  if (config == null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="rounded-xl border border-edge-subtle bg-surface-panel p-6">
          <p className="text-xs text-content-muted">Loading configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-xl border border-edge-subtle bg-surface-panel"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-subtle px-6 py-4">
          <h2 id="config-title" className="text-sm font-semibold text-content-primary">
            Edit Configuration
          </h2>
          <button
            onClick={onClose}
            autoFocus
            className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover"
          >
            Close
          </button>
        </div>

        {/* Settings */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-4">
            {Object.entries(config.values).map(([key, originalValue]) => (
              <div key={key}>
                <label className="mb-0.5 block text-xs font-medium text-content-primary">
                  {key}
                </label>
                <p className="mb-1.5 text-[10px] text-content-disabled">
                  {config.descriptions[key] ?? ''}
                </p>
                {typeof originalValue === 'number' ? (
                  <input
                    type="number"
                    value={draft[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge-subtle px-6 py-3">
          <div className="text-[10px]">
            {error != null && <span className="text-error">{error}</span>}
            {saved && !error && (
              <span className="text-success">Saved. Some changes require a restart.</span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getAPI() {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: {
    configLoad(): Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
    configSave(config: Record<string, unknown>): Promise<void>
  } }).consiliumAPI ?? null
}
