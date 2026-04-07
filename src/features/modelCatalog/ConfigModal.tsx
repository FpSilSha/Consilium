import { type ReactNode, useState, useEffect, useCallback } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { ProviderTab } from './ProviderTab'
import { CustomProviderTab } from './CustomProviderTab'
import { AdapterBuilderDialog } from '@/features/customAdapter/AdapterBuilderDialog'

interface CustomProviderDef {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly modelListEndpoint: string | null
  readonly healthCheckEndpoint: string | null
  readonly costEndpoint: string | null
}

const BUILT_IN_PROVIDERS: readonly { readonly value: Provider; readonly label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openrouter', label: 'OpenRouter' },
]

interface ConfigModalProps {
  readonly onClose: () => void
}

export function ConfigModal({ onClose }: ConfigModalProps): ReactNode {
  const [activeTab, setActiveTab] = useState<string>('anthropic')
  const [customProviders, setCustomProviders] = useState<readonly CustomProviderDef[]>([])
  const [showAdapterBuilder, setShowAdapterBuilder] = useState(false)

  // Load custom providers from config on mount
  useEffect(() => {
    const api = getAPI()
    if (api == null) return
    api.customProvidersLoad()
      .then((providers) => setCustomProviders(providers as CustomProviderDef[]))
      .catch(() => {})
  }, [])

  const handleAddProvider = useCallback(async (provider: CustomProviderDef) => {
    const updated = [...customProviders, provider]
    setCustomProviders(updated)
    setActiveTab(`custom:${provider.id}`)

    const api = getAPI()
    if (api == null) return
    try { await api.customProvidersSave(updated) } catch { /* non-fatal */ }
  }, [customProviders])

  const handleRemoveProvider = useCallback(async (id: string) => {
    const provider = customProviders.find((p) => p.id === id)
    const updated = customProviders.filter((p) => p.id !== id)
    setCustomProviders(updated)
    setActiveTab('anthropic')

    // Remove associated keys
    if (provider != null) {
      const state = useStore.getState()
      const orphanedKeys = state.keys.filter(
        (k) => k.provider === 'custom' && k.baseUrl === provider.baseUrl,
      )
      for (const k of orphanedKeys) {
        state.removeKey(k.id)
        window.consiliumAPI?.keysDelete(k.id).catch(() => {})
      }
    }

    const api = getAPI()
    if (api == null) return
    try { await api.customProvidersSave(updated) } catch { /* non-fatal */ }
  }, [customProviders])

  const handleUpdateProvider = useCallback(async (updated: CustomProviderDef) => {
    const newList = customProviders.map((p) => p.id === updated.id ? updated : p)
    setCustomProviders(newList)

    const api = getAPI()
    if (api == null) return
    try { await api.customProvidersSave(newList) } catch { /* non-fatal */ }
  }, [customProviders])

  const isBuiltIn = BUILT_IN_PROVIDERS.some((p) => p.value === activeTab)
  const activeCustom = customProviders.find((p) => `custom:${p.id}` === activeTab)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-modal-title"
        className="mx-4 flex h-[80vh] w-full max-w-4xl flex-col rounded-xl border border-edge-subtle bg-surface-panel"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-subtle px-6 py-4">
          <h2 id="config-modal-title" className="text-sm font-semibold text-content-primary">
            Models & Keys
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdapterBuilder(true)}
              className="rounded-md bg-surface-hover px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary"
            >
              Adapter Builder
            </button>
            <button
              onClick={onClose}
              autoFocus
              className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
            >
              Close
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-label="Provider" className="flex flex-wrap gap-1 border-b border-edge-subtle px-6 pt-2">
          {BUILT_IN_PROVIDERS.map((p) => (
            <button
              key={p.value}
              role="tab"
              aria-selected={activeTab === p.value}
              tabIndex={activeTab === p.value ? 0 : -1}
              onClick={() => setActiveTab(p.value)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === p.value
                  ? 'border-b-2 border-accent-blue bg-surface-base text-accent-blue'
                  : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
          {customProviders.map((cp) => (
            <button
              key={cp.id}
              role="tab"
              aria-selected={activeTab === `custom:${cp.id}`}
              tabIndex={activeTab === `custom:${cp.id}` ? 0 : -1}
              onClick={() => setActiveTab(`custom:${cp.id}`)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === `custom:${cp.id}`
                  ? 'border-b-2 border-accent-blue bg-surface-base text-accent-blue'
                  : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
              }`}
            >
              {cp.name}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={activeTab === 'add-provider'}
            tabIndex={activeTab === 'add-provider' ? 0 : -1}
            onClick={() => setActiveTab('add-provider')}
            className={`rounded-t-md px-2 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'add-provider'
                ? 'border-b-2 border-accent-blue bg-surface-base text-accent-blue'
                : 'text-content-disabled hover:bg-surface-hover hover:text-content-muted'
            }`}
          >
            + Add Provider
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isBuiltIn && (
            <ProviderTab provider={activeTab as Provider} />
          )}
          {activeCustom != null && (
            <CustomProviderTab
              providerDef={activeCustom}
              onRemove={() => handleRemoveProvider(activeCustom.id)}
              onUpdate={handleUpdateProvider}
            />
          )}
          {activeTab === 'add-provider' && (
            <AddProviderForm
              onAdd={handleAddProvider}
              onCancel={() => setActiveTab('anthropic')}
              existingIds={customProviders.map((p) => p.id)}
            />
          )}
        </div>

        {/* Adapter Builder Dialog */}
        {showAdapterBuilder && (
          <AdapterBuilderDialog
            onSave={() => setShowAdapterBuilder(false)}
            onClose={() => setShowAdapterBuilder(false)}
          />
        )}
      </div>
    </div>
  )
}

function AddProviderForm({ onAdd, onCancel, existingIds }: {
  readonly onAdd: (provider: CustomProviderDef) => void
  readonly onCancel: () => void
  readonly existingIds: readonly string[]
}): ReactNode {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelListEndpoint, setModelListEndpoint] = useState('')
  const [healthCheckEndpoint, setHealthCheckEndpoint] = useState('')
  const [costEndpoint, setCostEndpoint] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(() => {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Provider name is required')
      return
    }

    // Generate and validate slug before URL validation
    const id = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (id === '') {
      setError('Provider name must contain at least one letter or number')
      return
    }
    if (existingIds.includes(id)) {
      setError(`Provider "${id}" already exists`)
      return
    }

    const trimmedUrl = baseUrl.trim()
    if (trimmedUrl === '') {
      setError('Base URL is required')
      return
    }

    try {
      const parsed = new URL(trimmedUrl)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        setError('URL must use http or https')
        return
      }
    } catch {
      setError('Invalid URL format')
      return
    }

    onAdd({
      id,
      name: trimmedName,
      baseUrl: trimmedUrl,
      modelListEndpoint: modelListEndpoint.trim() || null,
      healthCheckEndpoint: healthCheckEndpoint.trim() || null,
      costEndpoint: costEndpoint.trim() || null,
    })
  }, [name, baseUrl, modelListEndpoint, healthCheckEndpoint, costEndpoint, existingIds, onAdd])

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-content-primary">Add Custom Provider</h3>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Provider Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          placeholder="e.g. Local LLaMA"
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Base URL</label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => { setBaseUrl(e.target.value); setError(null) }}
          placeholder="e.g. http://localhost:8080/v1"
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
        />
        <p className="mt-0.5 text-[10px] text-content-disabled">
          The base URL for this provider's OpenAI-compatible API.
        </p>
      </div>

      {/* Advanced section */}
      <details className="rounded-md border border-edge-subtle bg-surface-base p-3">
        <summary className="cursor-pointer text-xs font-medium text-content-muted">
          Advanced (optional)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[10px] text-content-disabled">Model List Endpoint</label>
            <input
              type="text"
              value={modelListEndpoint}
              onChange={(e) => setModelListEndpoint(e.target.value)}
              placeholder="/models"
              className="w-full rounded-md border border-edge-subtle bg-surface-panel px-3 py-1 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
            />
            <p className="mt-0.5 text-[10px] text-content-disabled">
              Relative path appended to base URL to list available models. Leave blank if not available.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-content-disabled">Health Check Endpoint</label>
            <input
              type="text"
              value={healthCheckEndpoint}
              onChange={(e) => setHealthCheckEndpoint(e.target.value)}
              placeholder="/health"
              className="w-full rounded-md border border-edge-subtle bg-surface-panel px-3 py-1 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
            />
            <p className="mt-0.5 text-[10px] text-content-disabled">
              Used to validate connectivity when adding an API key.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-content-disabled">Cost Endpoint</label>
            <input
              type="text"
              value={costEndpoint}
              onChange={(e) => setCostEndpoint(e.target.value)}
              placeholder=""
              className="w-full rounded-md border border-edge-subtle bg-surface-panel px-3 py-1 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
            />
            <p className="mt-0.5 text-[10px] text-content-disabled">
              Endpoint that returns pricing information per model.
            </p>
          </div>
        </div>
      </details>

      {error != null && <p className="text-xs text-error">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-active"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
        >
          Save Provider
        </button>
      </div>
    </div>
  )
}

function getAPI() {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: {
    configLoad(): Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
    configSave(config: Record<string, unknown>): Promise<void>
    customProvidersLoad(): Promise<readonly Record<string, unknown>[]>
    customProvidersSave(providers: readonly Record<string, unknown>[]): Promise<void>
  } }).consiliumAPI ?? null
}
