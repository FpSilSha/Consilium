import type { StateCreator } from 'zustand'
import type { ApiKey, ModelInfo, Provider } from '@/types'

export interface KeysSlice {
  readonly keys: readonly ApiKey[]
  readonly keysLoaded: boolean
  readonly openRouterModels: readonly ModelInfo[]
  addKey: (key: ApiKey) => void
  removeKey: (keyId: string) => void
  setKeys: (keys: readonly ApiKey[]) => void
  setKeysLoaded: (loaded: boolean) => void
  setOpenRouterModels: (models: readonly ModelInfo[]) => void
}

export const createKeysSlice: StateCreator<KeysSlice> = (set) => ({
  keys: [],
  keysLoaded: false,
  openRouterModels: [],

  addKey: (key) =>
    set((state) => ({
      keys: state.keys.some((k) => k.id === key.id) ? state.keys : [...state.keys, key],
    })),

  removeKey: (keyId) =>
    set((state) => {
      const removedKey = state.keys.find((k) => k.id === keyId)
      const newKeys = state.keys.filter((k) => k.id !== keyId)
      // Clear cached OpenRouter models when an OpenRouter key is removed
      const clearModels = removedKey?.provider === 'openrouter'
        && !newKeys.some((k) => k.provider === 'openrouter')
      return {
        keys: newKeys,
        ...(clearModels ? { openRouterModels: [] } : {}),
      }
    }),

  setKeys: (keys) => set({ keys }),

  setKeysLoaded: (loaded) => set({ keysLoaded: loaded }),

  setOpenRouterModels: (models) => set({ openRouterModels: models }),
})
