import type { StateCreator } from 'zustand'
import type { ApiKey } from '@/types'

export interface KeysSlice {
  readonly keys: readonly ApiKey[]
}

export const createKeysSlice: StateCreator<KeysSlice> = () => ({
  keys: [],
})
