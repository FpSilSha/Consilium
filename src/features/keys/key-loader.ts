import { useStore } from '@/store'
import { createApiKeyEntry, isValidProvider } from './key-storage'
import { storeRawKey, getRawKey } from './key-vault'
import { validateKey } from './key-validation'
import { detectProvider } from './key-detection'

/**
 * Loads persisted encrypted keys from the main process on app startup.
 * Populates both the in-memory vault and the Zustand store.
 */
export async function loadPersistedKeys(): Promise<void> {
  const api = window.consiliumAPI
  if (api == null) return

  try {
    const available = await api.keysAvailable()
    if (!available) return

    const storedKeys = await api.keysLoad()

    for (const { providerId, rawKey, provider, baseUrl } of storedKeys) {
      // Use persisted provider if valid, otherwise auto-detect
      const providerOverride = isValidProvider(provider) ? provider : undefined

      const entry = createApiKeyEntry(rawKey, providerOverride)
      if (entry == null) continue

      // Use the persisted ID so delete operations match, restore baseUrl
      const entryWithId = {
        ...entry,
        id: providerId,
        ...(baseUrl != null ? { baseUrl } : {}),
      }

      storeRawKey(entryWithId.id, rawKey)
      useStore.getState().addKey(entryWithId)
    }
  } finally {
    useStore.getState().setKeysLoaded(true)
  }

  // Background re-verification of unverified keys (fire-and-forget)
  reverifyUnverifiedKeys().catch(() => {})
}

/**
 * Re-verifies keys that are marked as unverified.
 * Runs in the background after startup — does not block the UI.
 * Uses zero-token endpoints where possible (GET /models).
 */
async function reverifyUnverifiedKeys(): Promise<void> {
  const state = useStore.getState()
  const unverified = state.keys.filter((k) => !k.verified && k.provider !== 'custom')

  for (const key of unverified) {
    const rawKey = getRawKey(key.id)
    if (rawKey == null) continue

    const detected = detectProvider(rawKey)
    if (detected == null) continue

    try {
      const result = await validateKey(rawKey, detected.provider)
      if (result.valid) {
        useStore.getState().updateKey(key.id, { verified: true })
      }
    } catch { /* non-fatal */ }
  }
}
