import { type ReactNode, useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { createApiKeyEntry } from './key-storage'
import { storeRawKey, removeRawKey } from './key-vault'
import { detectProvider } from './key-detection'
import { validateKey } from './key-validation'

interface KeyManagerProps {
  readonly onClose: () => void
}

export function KeyManager({ onClose }: KeyManagerProps): ReactNode {
  const keys = useStore((s) => s.keys)
  const addKey = useStore((s) => s.addKey)
  const removeKey = useStore((s) => s.removeKey)

  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomUrl, setShowCustomUrl] = useState(false)
  const [validating, setValidating] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    window.consiliumAPI?.keysAvailable()
      .then((available) => { if (!cancelled) setEncryptionAvailable(available) })
      .catch(() => { if (!cancelled) setEncryptionAvailable(false) })
    return () => { cancelled = true }
  }, [])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const handleAddKey = useCallback(async () => {
    const trimmed = keyInput.trim()
    if (trimmed === '') {
      setError('Please enter an API key')
      return
    }

    const detected = detectProvider(trimmed)

    // Unknown key format: prompt for custom URL
    if (detected === null && !showCustomUrl) {
      setShowCustomUrl(true)
      setError('Unknown key format. Enter the provider\u2019s base URL below.')
      return
    }

    // Custom URL mode: validate URL
    if (detected === null && showCustomUrl) {
      const urlTrimmed = customUrl.trim()
      if (urlTrimmed === '') {
        setError('Please enter a base URL (e.g. https://api.example.com/v1)')
        return
      }
      try {
        const parsed = new URL(urlTrimmed)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          setError('URL must use http or https')
          return
        }
      } catch {
        setError('Invalid URL format')
        return
      }
    }

    const provider = detected?.provider ?? 'custom'
    const entry = createApiKeyEntry(trimmed, provider)
    if (entry === null) {
      setError('Invalid API key format')
      return
    }

    const baseUrl = detected === null ? customUrl.trim() : undefined
    const entryWithUrl = baseUrl !== undefined ? { ...entry, baseUrl } : entry

    // Validate key with a lightweight API call (skip for custom providers)
    let verified = false
    if (detected !== null) {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setValidating(true)
      setError('')

      const result = await validateKey(trimmed, detected.provider, controller.signal)
      setValidating(false)

      if (controller.signal.aborted) return

      if (!result.valid) {
        if (result.reason === 'auth_failure') {
          setError('This API key is invalid or revoked. Please check and try again.')
          return
        }
        if (result.reason === 'cancelled') return
        // Network error: proceed as unverified
      } else {
        verified = true
      }
    }

    const finalEntry = { ...entryWithUrl, verified }
    addKey(finalEntry)
    storeRawKey(finalEntry.id, trimmed)

    try {
      const metadata = finalEntry.baseUrl != null
        ? { provider: finalEntry.provider, baseUrl: finalEntry.baseUrl }
        : { provider: finalEntry.provider }
      await window.consiliumAPI?.keysSave(finalEntry.id, trimmed, metadata)
    } catch {
      // Non-fatal
    }

    setKeyInput('')
    setCustomUrl('')
    setShowCustomUrl(false)
    setError(verified ? '' : detected !== null ? 'Key saved as unverified — could not reach provider to confirm.' : '')
  }, [keyInput, addKey, showCustomUrl, customUrl])

  const handleRemoveKey = useCallback(async (keyId: string) => {
    const key = keys.find((k) => k.id === keyId)

    // Remove from memory
    removeKey(keyId)
    removeRawKey(keyId)

    // Remove from encrypted storage
    if (key != null) {
      try {
        await window.consiliumAPI?.keysDelete(key.id)
      } catch {
        // Non-fatal
      }
    }

    setConfirmRemoveId(null)
  }, [keys, removeKey])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-lg rounded-lg border border-edge-subtle bg-surface-base p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-content-primary">API Keys</h2>
          <button
            onClick={onClose}
            className="text-xs text-content-disabled hover:text-content-primary"
          >
            Close
          </button>
        </div>

        {/* Existing keys */}
        {keys.length > 0 ? (
          <div className="mb-4 space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded border border-edge-subtle bg-surface-disabled px-3 py-2"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="shrink-0 rounded bg-surface-panel px-1.5 py-0.5 text-xs font-medium text-content-muted">
                    {key.provider}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-content-disabled">
                    {key.maskedKey}
                  </span>
                  {key.baseUrl != null && (
                    <span className="truncate text-[10px] text-content-disabled" title={key.baseUrl}>
                      {key.baseUrl}
                    </span>
                  )}
                  {!key.verified && (
                    <span className="shrink-0 rounded bg-yellow-900/40 px-1.5 py-0.5 text-xs text-yellow-500">
                      unverified
                    </span>
                  )}
                </div>
                {confirmRemoveId === key.id ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleRemoveKey(key.id)}
                      className="rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      className="rounded bg-surface-hover px-2 py-0.5 text-xs text-content-primary hover:bg-surface-active"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(key.id)}
                    className="text-xs text-content-disabled hover:text-error"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded border border-edge-subtle bg-surface-disabled px-3 py-4 text-center text-xs text-content-disabled">
            No API keys configured.
          </div>
        )}

        {/* Add new key */}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-content-disabled">Add a new key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setError(''); setShowCustomUrl(false); setCustomUrl('') }}
              placeholder="sk-ant-..., sk-proj-..., AIza..., xai-..."
              className="flex-1 rounded border border-edge-subtle bg-surface-panel px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
              onKeyDown={(e) => { if (e.key === 'Enter' && !showCustomUrl) { handleAddKey() } }}
              disabled={validating}
            />
            <button
              onClick={() => { handleAddKey() }}
              className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
              disabled={validating}
            >
              {validating ? '...' : showCustomUrl ? 'Add Custom' : 'Add'}
            </button>
          </div>
          {showCustomUrl && (
            <div className="mt-2">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => { setCustomUrl(e.target.value); setError('') }}
                placeholder="https://api.example.com/v1"
                className="w-full rounded border border-edge-subtle bg-surface-panel px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
                disabled={validating}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleAddKey() } }}
              />
              <p className="mt-0.5 text-[10px] text-content-disabled">Provider API base URL</p>
            </div>
          )}
          {error !== '' && (
            <p className={`mt-1 text-xs ${error.includes('unverified') || showCustomUrl ? 'text-yellow-400' : 'text-red-400'}`}>{error}</p>
          )}
        </div>

        {/* Security notice */}
        <div className="rounded border border-edge-subtle bg-surface-disabled p-2.5 text-xs text-content-disabled">
          {encryptionAvailable === true
            ? 'Keys are encrypted at rest using your OS keychain (DPAPI/Keychain/libsecret) and persist across sessions.'
            : encryptionAvailable === false
              ? 'OS keychain unavailable — keys are held in memory only and will be lost when the app closes.'
              : 'Checking encryption availability...'}
          {' '}Keys are never sent to third parties or included in exports.
        </div>
      </div>
    </div>
  )
}
