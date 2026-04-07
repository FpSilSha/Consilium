import { type ReactNode, useCallback, useState, useMemo, useEffect, useRef } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { formatProviderLabel } from '@/features/modelCatalog/format-provider-label'
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'

/**
 * Auto-compaction Settings pane — global default for new sessions,
 * ported from the standalone AutoCompactionSettingsModal into the
 * unified ConfigurationModal as a native pane.
 *
 * Three ways to pick a model:
 *   1. Active advisor quick-pick
 *   2. Browse all models (provider + searchable model list)
 *   3. Off — no global default
 *
 * Per-session overrides still happen via the AutoCompactButton in
 * the input bar — this pane only manages the GLOBAL default for new
 * sessions, persisted to config.json.
 *
 * Structurally identical to the pre-port modal body minus the outer
 * fixed-position chrome.
 */
export function AutoCompactionSettingsPane(): ReactNode {
  const globalEnabled = useStore((s) => s.globalAutoCompactionEnabled)
  const globalConfig = useStore((s) => s.globalAutoCompactionConfig)
  const setGlobalAutoCompaction = useStore((s) => s.setGlobalAutoCompaction)
  const setAutoCompactionWarning = useStore((s) => s.setAutoCompactionWarning)
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const keys = useStore((s) => s.keys)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []

  // Local draft — only commits to store + disk when the user clicks Save.
  const [draftEnabled, setDraftEnabled] = useState(globalEnabled)
  const [draftConfig, setDraftConfig] = useState(globalConfig)
  const [browseMode, setBrowseMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync draft when the underlying store values change.
  useEffect(() => {
    setDraftEnabled(globalEnabled)
    setDraftConfig(globalConfig)
  }, [globalEnabled, globalConfig])

  // Dirty detection: draft differs from committed store values.
  const isDirty =
    draftEnabled !== globalEnabled ||
    draftConfig?.provider !== globalConfig?.provider ||
    draftConfig?.model !== globalConfig?.model ||
    draftConfig?.keyId !== globalConfig?.keyId

  const registerDirtyGuard = useRegisterDirtyGuard()
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved auto-compaction settings?')
    })
    return () => registerDirtyGuard(null)
  }, [registerDirtyGuard])

  const selectedLabel = draftEnabled && draftConfig != null
    ? (getModelById(draftConfig.model, orModels)?.name ?? draftConfig.model.split('/').pop() ?? 'Model')
    : 'Off'

  const handleSelectAdvisor = useCallback((provider: string, model: string, keyId: string) => {
    setDraftEnabled(true)
    setDraftConfig({ provider, model, keyId })
    setBrowseMode(false)
    setSaved(false)
  }, [])

  const handleDisable = useCallback(() => {
    setDraftEnabled(false)
    setDraftConfig(null)
    setBrowseMode(false)
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)

    // Commit to store immediately so open sessions see the new global.
    // If the disk write fails below, the store is ahead of disk until
    // the user retries — a deliberate trade-off from the original
    // modal, preserved on the port for behavioral parity.
    setGlobalAutoCompaction(draftEnabled, draftConfig)
    setAutoCompactionWarning(null)

    const api = (window as { consiliumAPI?: {
      configLoad(): Promise<{ values: Record<string, unknown> }>
      configSave(config: Record<string, unknown>): Promise<void>
    } }).consiliumAPI

    if (api == null) {
      setError('Configuration API not available')
      setSaving(false)
      return
    }

    try {
      const current = await api.configLoad()
      await api.configSave({
        ...current.values,
        autoCompactionEnabled: draftEnabled,
        autoCompactionConfig: draftConfig,
      })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [draftEnabled, draftConfig, setGlobalAutoCompaction, setAutoCompactionWarning])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">Auto-compaction</h3>
        <p className="mt-1 text-xs text-content-muted">
          Global default for new sessions. Existing sessions keep their per-chat setting.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <p className="mb-3 text-xs text-content-muted">
          When enabled, new sessions will automatically summarize older messages once any advisor
          crosses 65% of its model's context window. You can still toggle individual chats via the
          Auto-compact button in the input bar.
        </p>

        <p className="mb-4 rounded border border-yellow-500/30 bg-yellow-900/20 px-3 py-2 text-[11px] text-yellow-200">
          <strong>Warning:</strong> Sends conversation history to the selected model whenever
          auto-compaction fires. Cheaper models may produce a less accurate summary. Cost tracked
          under &quot;System&quot;.
        </p>

        {/* Current status pill */}
        <div className="mb-4 flex items-center gap-2 rounded-md border border-edge-subtle bg-surface-base px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-content-muted">
            Default
          </span>
          <span
            className={`ml-auto text-xs ${draftEnabled ? 'text-accent-blue' : 'text-content-muted'}`}
          >
            {selectedLabel}
          </span>
        </div>

        {!browseMode ? (
          <div className="flex flex-col gap-1">
            {/* Off */}
            <button
              onClick={handleDisable}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover ${
                !draftEnabled ? 'bg-surface-hover text-content-primary' : 'text-content-muted'
              }`}
            >
              <div className="h-2.5 w-2.5 rounded-full bg-content-disabled" />
              <span>Off — new sessions start with auto-compaction disabled</span>
              {!draftEnabled && <span className="ml-auto text-[10px] text-accent-blue">✓</span>}
            </button>

            {/* Active advisors quick-pick */}
            {windowOrder.length > 0 && (
              <>
                <p className="mb-1 mt-2 text-[10px] font-medium text-content-muted">
                  Active Advisors
                </p>
                {windowOrder.map((id) => {
                  const win = windows[id]
                  if (win == null) return null
                  const isSelected =
                    draftEnabled &&
                    draftConfig?.keyId === win.keyId &&
                    draftConfig?.model === win.model
                  return (
                    <button
                      key={id}
                      onClick={() => handleSelectAdvisor(win.provider, win.model, win.keyId)}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover ${
                        isSelected
                          ? 'bg-surface-hover text-content-primary'
                          : 'text-content-primary'
                      }`}
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: win.accentColor }}
                      />
                      <span className="truncate">{win.personaLabel}</span>
                      <span className="ml-auto truncate text-[10px] text-content-disabled">
                        {win.model.split('/').pop()}
                      </span>
                      {isSelected && <span className="text-[10px] text-accent-blue">✓</span>}
                    </button>
                  )
                })}
              </>
            )}

            {/* Browse all models */}
            {keys.length > 0 && (
              <button
                onClick={() => setBrowseMode(true)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-edge-subtle px-3 py-2 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary"
              >
                Browse all available models…
              </button>
            )}

            {keys.length === 0 && (
              <p className="mt-2 text-[10px] text-content-disabled">
                No API keys configured. Add a key in Models &amp; Keys before choosing a model.
              </p>
            )}
          </div>
        ) : (
          <BrowseModels onSelect={handleSelectAdvisor} onBack={() => setBrowseMode(false)} />
        )}

        {/* Footer — per-pane save */}
        <div className="mt-6 flex items-center justify-between border-t border-edge-subtle pt-3">
          <div className="text-[10px]">
            {error != null && <span className="text-error">{error}</span>}
            {saved && error == null && (
              <span className="text-accent-green">Saved. New sessions will use this default.</span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Browse All Models — provider + searchable model list (same UX as
// AutoCompactButton, unchanged from the original modal)
// ─────────────────────────────────────────────────────────────────────────

interface BrowseModelsProps {
  readonly onSelect: (provider: string, model: string, keyId: string) => void
  readonly onBack: () => void
}

function BrowseModels({ onSelect, onBack }: BrowseModelsProps): ReactNode {
  const keys = useStore((s) => s.keys)

  const providersWithKeys = useMemo(() => {
    const map = new Map<Provider, { keyId: string; label: string }>()
    for (const key of keys) {
      const provider = key.provider as Provider
      if (!map.has(provider)) {
        map.set(provider, { keyId: key.id, label: formatProviderLabel(provider) })
      }
    }
    return Array.from(map.entries()).map(([provider, info]) => ({ provider, ...info }))
  }, [keys])

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    providersWithKeys[0]?.provider ?? null,
  )

  if (providersWithKeys.length === 0) {
    return (
      <div className="rounded-md border border-edge-subtle p-3">
        <p className="text-xs text-content-disabled">
          No API keys configured. Add a key in Models &amp; Keys first.
        </p>
        <button
          onClick={onBack}
          className="mt-2 text-xs text-accent-blue underline hover:text-accent-blue/80"
        >
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-edge-subtle p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium text-content-muted">Browse models</p>
        <button
          onClick={onBack}
          className="text-[10px] text-content-muted hover:text-content-primary"
        >
          ← Back
        </button>
      </div>

      <label className="mb-1 block text-[10px] text-content-muted">Provider</label>
      <select
        value={selectedProvider ?? ''}
        onChange={(e) => setSelectedProvider(e.target.value as Provider)}
        className="mb-3 w-full rounded-md border border-edge-subtle bg-surface-base px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
      >
        {providersWithKeys.map((p) => (
          <option key={p.provider} value={p.provider}>
            {p.label}
          </option>
        ))}
      </select>

      {selectedProvider != null && (
        <BrowseModelsList
          provider={selectedProvider}
          keyId={providersWithKeys.find((p) => p.provider === selectedProvider)?.keyId ?? ''}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

function BrowseModelsList({
  provider,
  keyId,
  onSelect,
}: {
  readonly provider: Provider
  readonly keyId: string
  readonly onSelect: (provider: string, model: string, keyId: string) => void
}): ReactNode {
  const models = useFilteredModels(provider)

  if (models.length === 0) {
    return (
      <p className="text-[10px] text-content-disabled">
        No models available for this provider. Configure allowed models in Models &amp; Keys.
      </p>
    )
  }

  return (
    <>
      <label className="mb-1 block text-[10px] text-content-muted">Model</label>
      <SearchableModelSelect
        models={models}
        value=""
        onChange={(modelId) => onSelect(provider, modelId, keyId)}
      />
    </>
  )
}
