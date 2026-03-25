import { useStore } from '@/store'
import { createApiKeyEntry } from './key-storage'
import { storeRawKey } from './key-vault'

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

    for (const { providerId, rawKey } of storedKeys) {
      const entry = createApiKeyEntry(rawKey)
      if (entry == null) continue

      // Use the persisted ID so delete operations match
      const entryWithId = { ...entry, id: providerId }

      storeRawKey(entryWithId.id, rawKey)
      useStore.getState().addKey(entryWithId)
    }
  } finally {
    useStore.getState().setKeysLoaded(true)
  }
}
