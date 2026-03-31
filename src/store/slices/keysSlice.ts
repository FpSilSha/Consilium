import type { StateCreator } from 'zustand'
import type { ApiKey } from '@/types'

export interface KeysSlice {
  readonly keys: readonly ApiKey[]
  readonly keysLoaded: boolean
  addKey: (key: ApiKey) => void
  removeKey: (keyId: string) => void
  setKeys: (keys: readonly ApiKey[]) => void
  setKeysLoaded: (loaded: boolean) => void
}

export const createKeysSlice: StateCreator<KeysSlice> = (set) => ({
  keys: [],
  keysLoaded: false,

  addKey: (key) =>
    set((state) => ({
      keys: state.keys.some((k) => k.id === key.id) ? state.keys : [...state.keys, key],
    })),

  removeKey: (keyId) =>
    set((state) => ({
      keys: state.keys.filter((k) => k.id !== keyId),
    })),

  setKeys: (keys) => set({ keys }),

  setKeysLoaded: (loaded) => set({ keysLoaded: loaded }),
})
