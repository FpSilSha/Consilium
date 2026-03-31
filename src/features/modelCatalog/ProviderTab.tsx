import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { createApiKeyEntry } from '@/features/keys/key-storage'
import { storeRawKey, removeRawKey, getRawKey } from '@/features/keys/key-vault'
import { detectProvider } from '@/features/keys/key-detection'
import { validateKey } from '@/features/keys/key-validation'
import type { KnownProvider } from '@/features/keys/key-detection'
import { fetchOpenRouterCatalog, fetchOpenAICatalog, fetchGoogleCatalog, fetchXAICatalog, fetchDeepSeekCatalog } from '@/services/api/catalog'
import { ModelCheckboxList } from './ModelCheckboxList'

interface ProviderTabProps {
  readonly provider: Provider
}

export function ProviderTab({ provider }: ProviderTabProps): ReactNode {
  const keys = useStore((s) => s.keys)
  const addKey = useStore((s) => s.addKey)
  const removeKey = useStore((s) => s.removeKey)

  const providerKeys = keys.filter((k) => k.provider === provider)

  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceRef.current != null) clearTimeout(debounceRef.current)
    }
  }, [])

  // Debounced validation only — does NOT add/persist the key
  const doValidateOnly = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') return

    const detected = detectProvider(trimmed)
    if (detected != null && detected.provider !== provider) {
      setError(`This looks like a ${detected.provider} key, not ${provider}`)
      setValidated(false)
      return
    }

    if (detected != null && provider !== 'custom') {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setValidating(true)
      setError('')
      setValidated(null)
      const result = await validateKey(trimmed, detected.provider as KnownProvider, controller.signal)
      setValidating(false)

      if (controller.signal.aborted) return

      if (!result.valid && result.reason === 'auth_failure') {
        setError('Invalid or revoked API key')
        setValidated(false)
        return
      }
      if (!result.valid && result.reason === 'cancelled') return
      setValidated(result.valid)
    }
  }, [provider])

  // Explicit add — called on Enter or Add button click
  const doAddKey = useCallback(async () => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current)

    const trimmed = keyInput.trim()
    if (trimmed === '') {
      setError('Please enter an API key')
      return
    }

    const detected = detectProvider(trimmed)
    if (detected != null && detected.provider !== provider) {
      setError(`This looks like a ${detected.provider} key, not ${provider}`)
      return
    }

    const entry = createApiKeyEntry(trimmed, provider)
    if (entry === null) {
      setError('Invalid key format')
      return
    }

    // If not yet validated, validate first
    if (validated == null && detected != null && provider !== 'custom') {
      await doValidateOnly(trimmed)
    }

    const verifiedEntry = { ...entry, verified: validated === true }

    try {
      await window.consiliumAPI?.keysSave(verifiedEntry.id, trimmed, { provider })
    } catch { /* non-fatal */ }

    addKey(verifiedEntry)
    storeRawKey(verifiedEntry.id, trimmed)
    setKeyInput('')
    setError('')
    setValidated(null)
  }, [keyInput, provider, validated, addKey, doValidateOnly])

  const handleKeyInputChange = useCallback((value: string) => {
    setKeyInput(value)
    setError('')
    setValidated(null)
    if (debounceRef.current != null) clearTimeout(debounceRef.current)

    if (value.trim().length > 10) {
      debounceRef.current = setTimeout(() => {
        doValidateOnly(value)
      }, 500)
    }
  }, [doValidateOnly])

  const handleRemoveKey = useCallback((keyId: string) => {
    removeKey(keyId)
    removeRawKey(keyId)
    window.consiliumAPI?.keysDelete(keyId).catch(() => {})
  }, [removeKey])

  return (
    <div className="flex flex-col gap-4">
      {/* Key management */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-content-muted">API Key</h3>

        {providerKeys.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {providerKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-md bg-surface-base px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-content-muted">{k.maskedKey}</span>
                  {k.verified && <span className="text-[10px] text-success">verified</span>}
                  {!k.verified && <span className="text-[10px] text-content-disabled">unverified</span>}
                </div>
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
            onChange={(e) => handleKeyInputChange(e.target.value)}
            placeholder={`Paste ${provider} API key...`}
            disabled={validating}
            className="flex-1 rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (debounceRef.current != null) clearTimeout(debounceRef.current)
                doAddKey()
              }
            }}
          />
          <button
            onClick={doAddKey}
            disabled={validating || keyInput.trim() === ''}
            className="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            Add
          </button>
          {validating && (
            <span className="flex items-center text-xs text-content-muted">
              <span className="mr-1 h-2 w-2 animate-pulse rounded-full bg-accent-blue" />
            </span>
          )}
          {validated === true && !validating && (
            <span className="flex items-center text-[10px] text-success">valid</span>
          )}
          {validated === false && !validating && error === '' && (
            <span className="flex items-center text-[10px] text-error">invalid</span>
          )}
        </div>
        {error !== '' && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>

      {/* Model selection */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-content-muted">Available Models</h3>
          <RefreshButton provider={provider} />
        </div>
        <ModelCheckboxList provider={provider} />
      </div>
    </div>
  )
}

const DIRECT_FETCHERS: Partial<Record<Provider, (apiKey: string, signal?: AbortSignal) => Promise<import('@/services/api/catalog').CatalogFetchResult>>> = {
  openai: fetchOpenAICatalog,
  google: fetchGoogleCatalog,
  xai: fetchXAICatalog,
  deepseek: fetchDeepSeekCatalog,
}

function RefreshButton({ provider }: { readonly provider: Provider }): ReactNode {
  const catalogStatus = useStore((s) => s.catalogStatus[provider])
  const setCatalogModels = useStore((s) => s.setCatalogModels)
  const setCatalogStatus = useStore((s) => s.setCatalogStatus)
  const keys = useStore((s) => s.keys)

  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    setCatalogStatus(provider, 'loading')

    try {
      let result: import('@/services/api/catalog').CatalogFetchResult

      if (provider === 'openrouter') {
        result = await fetchOpenRouterCatalog()
      } else {
        const fetcher = DIRECT_FETCHERS[provider]
        if (fetcher == null) {
          setRefreshError('No fetcher available for this provider')
          setCatalogStatus(provider, 'error')
          setRefreshing(false)
          return
        }

        const key = keys.find((k) => k.provider === provider)
        if (key == null) {
          setRefreshError('Add an API key first to fetch models')
          setCatalogStatus(provider, 'error')
          setRefreshing(false)
          return
        }

        const rawKey = getRawKey(key.id)
        if (rawKey == null) {
          setRefreshError('API key not accessible')
          setCatalogStatus(provider, 'error')
          setRefreshing(false)
          return
        }

        result = await fetcher(rawKey)
      }

      if (result.error != null) {
        setRefreshError(result.error)
        setCatalogStatus(provider, 'error')
      } else {
        setCatalogModels(provider, result.models)
        setCatalogStatus(provider, 'loaded')
      }
    } catch {
      setRefreshError('Unexpected error during refresh')
      setCatalogStatus(provider, 'error')
    } finally {
      setRefreshing(false)
    }
  }, [provider, keys, setCatalogModels, setCatalogStatus])

  return (
    <div className="flex items-center gap-2">
      {refreshError != null && (
        <span className="text-[10px] text-error">{refreshError}</span>
      )}
      <button
        onClick={handleRefresh}
        disabled={refreshing || catalogStatus === 'loading'}
        className="rounded-md bg-surface-base px-2 py-1 text-[10px] text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary disabled:opacity-50"
      >
        {refreshing ? 'Refreshing...' : 'Refresh List'}
      </button>
    </div>
  )
}
