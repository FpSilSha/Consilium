import type { StateCreator } from 'zustand'
import type { ApiKey } from '@/types'

export interface KeysSlice {
  readonly keys: readonly ApiKey[]
  readonly keysLoaded: boolean
  /**
   * Whether OS-level key encryption is available via Electron's
   * safeStorage API. Mirrors `safeStorage.isEncryptionAvailable()`
   * from the main process. Populated by the startup key loader.
   *
   * - `true` (default) on Windows (DPAPI), macOS (Keychain), and
   *   Linux when libsecret/gnome-keyring or kwallet is installed.
   * - `false` on Linux when no secret service is available.
   *
   * When false, the key store refuses to write keys (it will not
   * fall back to plaintext) and the renderer surfaces a banner
   * warning the user that key persistence is unavailable until
   * they install a secret service.
   */
  readonly keysEncryptionAvailable: boolean
  addKey: (key: ApiKey) => void
  removeKey: (keyId: string) => void
  updateKey: (keyId: string, updates: Partial<Pick<ApiKey, 'verified'>>) => void
  setKeys: (keys: readonly ApiKey[]) => void
  setKeysLoaded: (loaded: boolean) => void
  setKeysEncryptionAvailable: (available: boolean) => void
}

export const createKeysSlice: StateCreator<KeysSlice> = (set) => ({
  keys: [],
  keysLoaded: false,
  // Default to true (the common case) so the warning doesn't flash
  // during the brief startup window before keys:available resolves.
  keysEncryptionAvailable: true,

  addKey: (key) =>
    set((state) => ({
      keys: state.keys.some((k) => k.id === key.id) ? state.keys : [...state.keys, key],
    })),

  removeKey: (keyId) =>
    set((state) => ({
      keys: state.keys.filter((k) => k.id !== keyId),
    })),

  updateKey: (keyId, updates) =>
    set((state) => ({
      keys: state.keys.map((k) => k.id === keyId ? { ...k, ...updates } : k),
    })),

  setKeys: (keys) => set({ keys }),

  setKeysLoaded: (loaded) => set({ keysLoaded: loaded }),

  setKeysEncryptionAvailable: (available) => set({ keysEncryptionAvailable: available }),
})
