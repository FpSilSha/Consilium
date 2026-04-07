import { type ReactNode, useCallback, useState, useMemo, useEffect } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'

interface CompileSettingsModalProps {
  readonly onClose: () => void
}

/**
 * Global Compile Document settings.
 *
 * Manages two things, both persisted to config.json:
 *   1. compileModelConfig — default model used by Compile Document. Set
 *      once here and every compile uses it unless the user picks a
 *      different model in the per-call popover.
 *   2. compileMaxTokens — output token cap for compile calls. Defaults
 *      to 16384 (16x the previous silent 4096 default). User can lower
 *      to save cost or raise if their model supports it.
 */
export function CompileSettingsModal({ onClose }: CompileSettingsModalProps): ReactNode {
  const compileModelConfig = useStore((s) => s.compileModelConfig)
  const compileMaxTokens = useStore((s) => s.compileMaxTokens)
  const setCompileModelConfig = useStore((s) => s.setCompileModelConfig)
  const setCompileMaxTokens = useStore((s) => s.setCompileMaxTokens)
  const keys = useStore((s) => s.keys)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []

  // Local draft — committed only on Save
  const [draftConfig, setDraftConfig] = useState(compileModelConfig)
  const [draftMaxTokens, setDraftMaxTokens] = useState(String(compileMaxTokens))
  const [browseMode, setBrowseMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraftConfig(compileModelConfig)
    setDraftMaxTokens(String(compileMaxTokens))
  }, [compileModelConfig, compileMaxTokens])

  const selectedLabel = draftConfig != null
    ? (getModelById(draftConfig.model, orModels)?.name ?? draftConfig.model.split('/').pop() ?? 'Model')
    : 'No default — picker will appear every compile'

  const handleSelectModel = useCallback((provider: string, model: string, keyId: string) => {
    setDraftConfig({ provider, model, keyId })
    setBrowseMode(false)
    setSaved(false)
  }, [])

  const handleClearDefault = useCallback(() => {
    setDraftConfig(null)
    setBrowseMode(false)
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)

    // Validate maxTokens
    const parsedMax = Number(draftMaxTokens)
    if (!Number.isFinite(parsedMax) || parsedMax <= 0) {
      setError('Max output tokens must be a positive number')
      setSaving(false)
      return
    }
    const validatedMax = Math.round(parsedMax)

    // Commit to store
    setCompileModelConfig(draftConfig)
    setCompileMaxTokens(validatedMax)

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
        compileModelConfig: draftConfig,
        compileMaxTokens: validatedMax,
      })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [draftConfig, draftMaxTokens, setCompileModelConfig, setCompileMaxTokens])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compile-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-xl border border-edge-subtle bg-surface-panel"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-subtle px-6 py-4">
          <div>
            <h2 id="compile-settings-title" className="text-sm font-semibold text-content-primary">
              Compile Document Settings
            </h2>
            <p className="mt-0.5 text-[10px] text-content-disabled">
              Default model and output limits for the Compile Document button
            </p>
          </div>
          <button
            onClick={onClose}
            autoFocus
            className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <p className="mb-3 text-xs text-content-muted">
            Compile Document is an isolated API call — it does not run as one of the advisors. The compiled result lands in the Documents panel on the right, not in the chat thread.
          </p>

          {/* Default model */}
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
              Default Compile Model
            </label>
            <p className="mb-2 text-[10px] text-content-disabled">
              The model used when you click Compile Document without overriding. Choose any model you have a key for. You can still pick a different model per-compile.
            </p>

            <div className="mb-2 flex items-center gap-2 rounded-md border border-edge-subtle bg-surface-base px-3 py-2">
              <span className={`text-xs ${draftConfig != null ? 'text-content-primary' : 'text-content-disabled italic'}`}>
                {selectedLabel}
              </span>
            </div>

            {!browseMode ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setBrowseMode(true)}
                  disabled={keys.length === 0}
                  className="flex-1 rounded-md border border-dashed border-edge-subtle px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary disabled:opacity-50"
                >
                  {keys.length === 0 ? 'No API keys configured' : 'Pick a model…'}
                </button>
                {draftConfig != null && (
                  <button
                    onClick={handleClearDefault}
                    className="rounded-md border border-edge-subtle px-3 py-1.5 text-xs text-content-muted hover:bg-surface-hover hover:text-content-primary"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <BrowseModels onSelect={handleSelectModel} onBack={() => setBrowseMode(false)} />
            )}
          </div>

          {/* Max tokens */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
              Max Output Tokens
            </label>
            <p className="mb-2 text-[10px] text-content-disabled">
              Output cap for compile calls. Higher values let the document grow longer before being truncated. Default 16384. The provider may cap server-side. Lower this to save cost on long compiles; raise it if your model supports more.
            </p>
            <input
              type="number"
              min={1}
              value={draftMaxTokens}
              onChange={(e) => { setDraftMaxTokens(e.target.value); setSaved(false) }}
              className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge-subtle px-6 py-3">
          <div className="text-[10px]">
            {error != null && <span className="text-error">{error}</span>}
            {saved && error == null && (
              <span className="text-accent-green">Saved.</span>
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
// Browse all models (same UX as the per-compile picker)
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

  return (
    <div className="rounded-md border border-edge-subtle p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium text-content-disabled">Browse models</p>
        <button onClick={onBack} className="text-[10px] text-content-muted hover:text-content-primary">
          ← Back
        </button>
      </div>

      <label className="mb-1 block text-[10px] text-content-disabled">Provider</label>
      <select
        value={selectedProvider ?? ''}
        onChange={(e) => setSelectedProvider(e.target.value as Provider)}
        className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-base px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
      >
        {providersWithKeys.map((p) => (
          <option key={p.provider} value={p.provider}>{p.label}</option>
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

function BrowseModelsList({ provider, keyId, onSelect }: {
  readonly provider: Provider
  readonly keyId: string
  readonly onSelect: (provider: string, model: string, keyId: string) => void
}): ReactNode {
  const models = useFilteredModels(provider)

  if (models.length === 0) {
    return <p className="text-[10px] text-content-disabled">No models available for this provider.</p>
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

function formatProviderLabel(provider: Provider): string {
  switch (provider) {
    case 'anthropic': return 'Anthropic'
    case 'openai': return 'OpenAI'
    case 'google': return 'Google'
    case 'xai': return 'xAI'
    case 'deepseek': return 'DeepSeek'
    case 'openrouter': return 'OpenRouter'
    case 'custom': return 'Custom'
    default: return provider
  }
}
