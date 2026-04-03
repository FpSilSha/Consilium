import type { StateCreator } from 'zustand'
import type { CustomAdapterDefinition } from '@/types'

export interface CustomAdaptersSlice {
  readonly customAdapters: readonly CustomAdapterDefinition[]
  setCustomAdapters: (adapters: readonly CustomAdapterDefinition[]) => void
  addCustomAdapter: (adapter: CustomAdapterDefinition) => void
  removeCustomAdapter: (id: string) => void
}

export const createCustomAdaptersSlice: StateCreator<CustomAdaptersSlice> = (set) => ({
  customAdapters: [],

  setCustomAdapters: (adapters) => set({ customAdapters: adapters }),

  addCustomAdapter: (adapter) =>
    set((state) => {
      const idx = state.customAdapters.findIndex((a) => a.id === adapter.id)
      return {
        customAdapters: idx === -1
          ? [...state.customAdapters, adapter]
          : [...state.customAdapters.slice(0, idx), adapter, ...state.customAdapters.slice(idx + 1)],
      }
    }),

  removeCustomAdapter: (id) =>
    set((state) => ({
      customAdapters: state.customAdapters.filter((a) => a.id !== id),
    })),
})
