import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store'
import { createApiKeyEntry } from '@/features/keys/key-storage'
import { storeRawKey, removeRawKey, getRawKey } from '@/features/keys/key-vault'
import { ModelCheckboxList } from './ModelCheckboxList'
import { testModelId } from './model-validation'

interface CustomProviderDef {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly modelListEndpoint: string | null
  readonly healthCheckEndpoint: string | null
  readonly costEndpoint: string | null
}

interface CustomProviderTabProps {
  readonly providerDef: CustomProviderDef
  readonly onRemove: () => void
}

export function CustomProviderTab({ providerDef, onRemove }: CustomProviderTabProps): ReactNode {
  const keys = useStore((s) => s.keys)
  const addKey = useStore((s) => s.addKey)
  const removeKey = useStore((s) => s.removeKey)
  const setCatalogModels = useStore((s) => s.setCatalogModels)
  const setCatalogStatus = useStore((s) => s.setCatalogStatus)

  // Keys for this custom provider are stored with provider='custom' and baseUrl matching
  const providerKeys = keys.filter((k) =>
    k.provider === 'custom' && k.baseUrl === providerDef.baseUrl,
  )

  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const handleAddKey = useCallback(async () => {
    const trimmed = keyInput.trim()
    if (trimmed === '') {
      setError('Please enter an API key')
      return
    }

    const entry = createApiKeyEntry(trimmed, 'custom')
    if (entry === null) {
      setError('Invalid key format')
      return
    }

    // Validate via health check if available
    if (providerDef.healthCheckEndpoint != null) {
      setValidating(true)
      setError('')
      try {
        const url = `${providerDef.baseUrl}${providerDef.healthCheckEndpoint}`
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${trimmed}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok && response.status === 401) {
          setError('Invalid API key')
          setValidating(false)
          return
        }
      } catch {
        // Health check failed but proceed anyway — might not require auth
      }
      setValidating(false)
    }

    const entryWithUrl = { ...entry, baseUrl: providerDef.baseUrl }

    try {
      await window.consiliumAPI?.keysSave(entryWithUrl.id, trimmed, {
        provider: 'custom',
        baseUrl: providerDef.baseUrl,
      })
    } catch { /* non-fatal */ }

    addKey(entryWithUrl)
    storeRawKey(entryWithUrl.id, trimmed)
    setKeyInput('')
    setError('')

    // Auto-fetch model list if endpoint is configured
    if (providerDef.modelListEndpoint != null) {
      fetchModelList(trimmed)
    }
  }, [keyInput, providerDef, addKey])

  const fetchModelList = useCallback(async (apiKey: string) => {
    if (providerDef.modelListEndpoint == null) return
    setFetchingModels(true)

    try {
      const url = `${providerDef.baseUrl}${providerDef.modelListEndpoint}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        setFetchingModels(false)
        return
      }
      let json: unknown
      try {
        json = await response.json()
      } catch {
        setFetchingModels(false)
        return
      }
      if (typeof json === 'object' && json != null && Array.isArray((json as Record<string, unknown>)['data'])) {
        const models = ((json as { data: readonly unknown[] }).data)
          .filter((m): m is { id: string } => m != null && typeof m === 'object' && typeof (m as Record<string, unknown>)['id'] === 'string')
          .map((m) => ({
            id: m.id,
            name: m.id,
            provider: 'custom' as const,
            contextWindow: 0,
            inputPricePerToken: 0,
            outputPricePerToken: 0,
          }))
        setCatalogModels('custom', models)
        setCatalogStatus('custom', 'loaded')
      }
    } catch { /* non-fatal */ }
    setFetchingModels(false)
  }, [providerDef, setCatalogModels, setCatalogStatus])

  const handleRemoveKey = useCallback((keyId: string) => {
    removeKey(keyId)
    removeRawKey(keyId)
    window.consiliumAPI?.keysDelete(keyId).catch(() => {})
  }, [removeKey])

  const handleRefreshModels = useCallback(() => {
    const key = providerKeys[0]
    if (key == null) return
    const rawKey = getRawKey(key.id)
    if (rawKey == null) return
    fetchModelList(rawKey)
  }, [providerKeys, fetchModelList])

  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* Provider info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-content-primary">{providerDef.name}</h3>
          <p className="text-[10px] text-content-disabled">{providerDef.baseUrl}</p>
        </div>
        {confirmRemove ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-error">Remove this provider?</span>
            <button
              onClick={onRemove}
              className="rounded-md bg-accent-red px-2 py-1 text-[10px] text-content-inverse hover:bg-accent-red/90"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="text-[10px] text-content-muted hover:text-content-primary"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="text-xs text-content-disabled transition-colors hover:text-accent-red"
          >
            Remove
          </button>
        )}
      </div>

      {/* API Key */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-content-muted">API Key</h3>

        {providerKeys.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {providerKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-md bg-surface-base px-3 py-1.5">
                <span className="font-mono text-xs text-content-muted">{k.maskedKey}</span>
                <button
                  onClick={() => handleRemoveKey(k.id)}
                  className="text-xs text-content-disabled transition-colors hover:text-accent-red"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setError('') }}
            placeholder="Paste API key..."
            disabled={validating}
            className="flex-1 rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus disabled:opacity-50"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddKey() }}
          />
          <button
            onClick={handleAddKey}
            disabled={validating || keyInput.trim() === ''}
            className="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {validating ? 'Checking...' : 'Add'}
          </button>
        </div>
        {error !== '' && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>

      {/* Models */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-content-muted">Available Models</h3>
          {providerDef.modelListEndpoint != null && (
            <button
              onClick={handleRefreshModels}
              disabled={fetchingModels || providerKeys.length === 0}
              className="rounded-md bg-surface-base px-2 py-1 text-[10px] text-content-muted transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {fetchingModels ? 'Fetching...' : 'Refresh List'}
            </button>
          )}
        </div>
        <ModelCheckboxList provider="custom" />
      </div>

      {/* Advanced info */}
      {(providerDef.modelListEndpoint != null || providerDef.healthCheckEndpoint != null || providerDef.costEndpoint != null) && (
        <details className="rounded-md border border-edge-subtle bg-surface-base p-3">
          <summary className="cursor-pointer text-xs font-medium text-content-muted">
            Configured Endpoints
          </summary>
          <div className="mt-2 flex flex-col gap-1 text-[10px] text-content-disabled">
            {providerDef.modelListEndpoint != null && (
              <div>Model List: <span className="text-content-muted">{providerDef.baseUrl}{providerDef.modelListEndpoint}</span></div>
            )}
            {providerDef.healthCheckEndpoint != null && (
              <div>Health Check: <span className="text-content-muted">{providerDef.baseUrl}{providerDef.healthCheckEndpoint}</span></div>
            )}
            {providerDef.costEndpoint != null && (
              <div>Cost: <span className="text-content-muted">{providerDef.baseUrl}{providerDef.costEndpoint}</span></div>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
