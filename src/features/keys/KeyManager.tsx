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
    if (detected === null) {
      setError('Could not detect provider. Supported: Anthropic (sk-ant-), OpenAI (sk-proj-), Google (AIza), xAI (xai-), DeepSeek (sk-)')
      return
    }

    const entry = createApiKeyEntry(trimmed)
    if (entry === null) {
      setError('Invalid API key format')
      return
    }

    // Validate key with a lightweight API call
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setValidating(true)
    setError('')

    const result = await validateKey(trimmed, detected.provider, controller.signal)
    setValidating(false)

    if (controller.signal.aborted) return

    if (!result.valid) {
      // Auth failure: reject the key
      if (result.reason === 'auth_failure') {
        setError('This API key is invalid or revoked. Please check and try again.')
        return
      }

      // Cancelled: do nothing
      if (result.reason === 'cancelled') return

      // Network error / timeout: allow with unverified status
      const unverifiedEntry = { ...entry, verified: false }
      addKey(unverifiedEntry)
      storeRawKey(unverifiedEntry.id, trimmed)

      try {
        await window.consiliumAPI?.keysSave(unverifiedEntry.id, trimmed)
      } catch {
        // Non-fatal
      }

      setKeyInput('')
      setError('Key saved as unverified — could not reach provider to confirm.')
      return
    }

    // Validation passed
    const verifiedEntry = { ...entry, verified: true }
    addKey(verifiedEntry)
    storeRawKey(verifiedEntry.id, trimmed)

    try {
      await window.consiliumAPI?.keysSave(verifiedEntry.id, trimmed)
    } catch {
      // Non-fatal
    }

    setKeyInput('')
    setError('')
  }, [keyInput, addKey])

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
      <div className="mx-4 w-full max-w-lg rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-200">API Keys</h2>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300"
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
                className="flex items-center justify-between rounded border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs font-medium text-gray-400">
                    {key.provider}
                  </span>
                  <span className="font-mono text-xs text-gray-500">
                    {key.maskedKey}
                  </span>
                  {!key.verified && (
                    <span className="rounded bg-yellow-900/40 px-1.5 py-0.5 text-xs text-yellow-500">
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
                      className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(key.id)}
                    className="text-xs text-gray-600 hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded border border-gray-800 bg-gray-950 px-3 py-4 text-center text-xs text-gray-500">
            No API keys configured.
          </div>
        )}

        {/* Add new key */}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-gray-500">Add a new key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setError('') }}
              placeholder="sk-ant-..., sk-proj-..., AIza..., xai-..."
              className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
              onKeyDown={(e) => { if (e.key === 'Enter') { handleAddKey() } }}
              disabled={validating}
            />
            <button
              onClick={() => { handleAddKey() }}
              className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
              disabled={validating}
            >
              {validating ? 'Validating...' : 'Add'}
            </button>
          </div>
          {error !== '' && (
            <p className={`mt-1 text-xs ${error.includes('unverified') ? 'text-yellow-400' : 'text-red-400'}`}>{error}</p>
          )}
        </div>

        {/* Security notice */}
        <div className="rounded border border-gray-800 bg-gray-950 p-2.5 text-xs text-gray-600">
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
