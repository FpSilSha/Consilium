import { type ReactNode, useCallback, useState, useMemo } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { getModelById } from '@/features/modelSelector/model-registry'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { formatProviderLabel } from '@/features/modelCatalog/format-provider-label'

/**
 * Toggle + model picker for automatic context compaction.
 *
 * Off by default. When the user enables it and picks a model, future turns
 * will trigger an LLM-summarized compaction the moment any advisor crosses
 * 65% of its model's context window. The smallest-context advisor effectively
 * drives the trigger because compaction shrinks the shared message bus.
 *
 * Three ways to pick a model:
 *   1. Click an active advisor — quick-pick their model
 *   2. Browse — pick any provider + model from keys the user has
 *   3. Off — disable for this session
 *
 * A "Set as default for new sessions" checkbox saves the current selection
 * to config.json, so new sessions inherit it. Startup check validates the
 * saved key still exists on app launch.
 *
 * Same warning copy as manual compaction: real cost, quality varies, the
 * action replaces chat messages with a summary.
 */
export function AutoCompactButton(): ReactNode {
  const [showPicker, setShowPicker] = useState(false)
  const [browseMode, setBrowseMode] = useState(false)
  const enabled = useStore((s) => s.autoCompactionEnabled)
  const config = useStore((s) => s.autoCompactionConfig)
  const warning = useStore((s) => s.autoCompactionWarning)
  const setAutoCompaction = useStore((s) => s.setAutoCompaction)
  const setAutoCompactionWarning = useStore((s) => s.setAutoCompactionWarning)
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const keys = useStore((s) => s.keys)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []

  // Resolve a friendly label for the current selection.
  const selectedLabel = enabled && config != null
    ? (getModelById(config.model, orModels)?.name ?? config.model.split('/').pop() ?? 'Auto')
    : 'Off'

  const handleDismissWarning = useCallback(() => {
    setAutoCompactionWarning(null)
  }, [setAutoCompactionWarning])

  const handleSelect = useCallback((provider: string, model: string, keyId: string) => {
    setAutoCompaction(true, { provider, model, keyId })
    setBrowseMode(false)
  }, [setAutoCompaction])

  const handleDisable = useCallback(() => {
    setAutoCompaction(false, null)
    setBrowseMode(false)
  }, [setAutoCompaction])

  return (
    <div className="relative">
      <Tooltip
        text={enabled
          ? 'Auto-compaction is ON — older messages will be summarized when context fills up'
          : 'Turn on auto-compaction to summarize older messages automatically'}
        position="top"
      >
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
            enabled
              ? 'bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30'
              : warning != null
                ? 'bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/30'
                : 'bg-surface-hover text-content-muted hover:bg-surface-active hover:text-content-primary'
          }`}
        >
          <span>Auto-compact: {selectedLabel}</span>
          {warning != null && <span className="text-[10px]">⚠</span>}
        </button>
      </Tooltip>

      {showPicker && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-80 rounded-md border border-edge-subtle bg-surface-panel p-2 shadow-lg">
          {/* Startup warning — shown prominently until dismissed or resolved */}
          {warning != null && (
            <div className="mb-2 rounded border border-yellow-500/30 bg-yellow-900/20 p-2">
              <p className="text-[10px] text-yellow-200">{warning}</p>
              <button
                onClick={handleDismissWarning}
                className="mt-1 text-[10px] text-yellow-400 underline hover:text-yellow-300"
              >
                Dismiss
              </button>
            </div>
          )}

          <p className="mb-1.5 text-[10px] text-content-disabled">
            Summarizes older messages automatically when context fills up.
          </p>
          <p className="mb-2 rounded bg-yellow-900/20 px-2 py-1 text-[10px] text-yellow-400">
            Sends conversation history to the selected model whenever auto-compaction fires. Cheaper models may produce a less accurate summary. Cost tracked under &quot;System&quot;.
          </p>

          {!browseMode ? (
            <>
              {/* Off entry */}
              <button
                onClick={handleDisable}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
                  !enabled ? 'bg-surface-hover text-content-primary' : 'text-content-muted'
                }`}
              >
                <div className="h-2.5 w-2.5 rounded-full bg-content-disabled" />
                <span>Off</span>
                {!enabled && <span className="ml-auto text-[10px] text-accent-blue">✓</span>}
              </button>

              {/* Active advisors — quick-pick */}
              {windowOrder.length > 0 && (
                <>
                  <p className="mb-1 mt-1.5 text-[10px] font-medium text-content-disabled">Active Advisors</p>
                  {windowOrder.map((id) => {
                    const win = windows[id]
                    if (win == null) return null
                    const isSelected = enabled && config?.keyId === win.keyId && config?.model === win.model
                    return (
                      <button
                        key={id}
                        onClick={() => handleSelect(win.provider, win.model, win.keyId)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
                          isSelected ? 'bg-surface-hover text-content-primary' : 'text-content-primary'
                        }`}
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: win.accentColor }} />
                        <span className="truncate">{win.personaLabel}</span>
                        <span className="ml-auto truncate text-[10px] text-content-disabled">{win.model.split('/').pop()}</span>
                        {isSelected && <span className="text-[10px] text-accent-blue">✓</span>}
                      </button>
                    )
                  })}
                </>
              )}

              {/* Browse all models toggle */}
              {keys.length > 0 && (
                <button
                  onClick={() => setBrowseMode(true)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-edge-subtle px-2 py-1.5 text-[10px] text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary"
                >
                  Browse all available models…
                </button>
              )}

              {/* Hint pointing to the global settings location */}
              <p className="mt-2 border-t border-edge-subtle pt-2 text-[10px] text-content-disabled">
                Set the default for new sessions in <span className="text-content-muted">Edit → Auto-compaction Settings</span>.
              </p>
            </>
          ) : (
            <BrowseModels onSelect={handleSelect} onBack={() => setBrowseMode(false)} />
          )}

          <div className="mt-1.5 flex justify-end">
            <button
              onClick={() => { setShowPicker(false); setBrowseMode(false) }}
              className="rounded-md px-2 py-1 text-[10px] text-content-disabled hover:text-content-muted"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Browse All Models — pick any provider + model from keys the user has
// ─────────────────────────────────────────────────────────────────────────

interface BrowseModelsProps {
  readonly onSelect: (provider: string, model: string, keyId: string) => void
  readonly onBack: () => void
}

function BrowseModels({ onSelect, onBack }: BrowseModelsProps): ReactNode {
  const keys = useStore((s) => s.keys)

  // Group keys by provider — the user picks a provider first (which determines
  // which key's credentials will be used), then a model from that provider's catalog.
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
      <div className="rounded-md border border-edge-subtle p-2">
        <p className="text-[10px] text-content-disabled">
          No API keys configured. Add a key in Models &amp; Keys first.
        </p>
        <button
          onClick={onBack}
          className="mt-1 text-[10px] text-accent-blue underline hover:text-accent-blue/80"
        >
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-edge-subtle p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium text-content-disabled">Browse models</p>
        <button
          onClick={onBack}
          className="text-[10px] text-content-muted hover:text-content-primary"
        >
          ← Back
        </button>
      </div>

      {/* Provider select */}
      <label className="mb-1 block text-[10px] text-content-disabled">Provider</label>
      <select
        value={selectedProvider ?? ''}
        onChange={(e) => setSelectedProvider(e.target.value as Provider)}
        className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-xs text-content-primary outline-none focus:border-edge-focus"
      >
        {providersWithKeys.map((p) => (
          <option key={p.provider} value={p.provider}>{p.label}</option>
        ))}
      </select>

      {/* Searchable model list for the selected provider */}
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

function BrowseModelsList({ provider, keyId, onSelect }: {
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
      <label className="mb-1 block text-[10px] text-content-disabled">Model</label>
      <SearchableModelSelect
        models={models}
        value=""
        onChange={(modelId) => onSelect(provider, modelId, keyId)}
      />
    </>
  )
}

