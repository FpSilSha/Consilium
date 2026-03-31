import type { StateCreator } from 'zustand'
import type { Provider, ModelInfo, CatalogStatus, PriceOverride } from '@/types'

export interface ModelCatalogSlice {
  /** Fetched model catalogs per provider */
  readonly catalogModels: Readonly<Record<Provider, readonly ModelInfo[]>>
  /** User-curated allowed models per provider. Empty array = all allowed. */
  readonly allowedModels: Readonly<Record<Provider, readonly string[]>>
  /** User-set price overrides keyed by model ID */
  readonly priceOverrides: Readonly<Record<string, PriceOverride>>
  /** Fetch status per provider */
  readonly catalogStatus: Readonly<Record<Provider, CatalogStatus>>

  setCatalogModels: (provider: Provider, models: readonly ModelInfo[]) => void
  setAllowedModels: (provider: Provider, modelIds: readonly string[]) => void
  setPriceOverride: (modelId: string, override: PriceOverride) => void
  removePriceOverride: (modelId: string) => void
  setCatalogStatus: (provider: Provider, status: CatalogStatus) => void
}

const EMPTY_PROVIDER_RECORD: Readonly<Record<Provider, readonly ModelInfo[]>> = {
  anthropic: [],
  openai: [],
  google: [],
  xai: [],
  deepseek: [],
  openrouter: [],
  custom: [],
}

const EMPTY_ALLOWED: Readonly<Record<Provider, readonly string[]>> = {
  anthropic: [],
  openai: [],
  google: [],
  xai: [],
  deepseek: [],
  openrouter: [],
  custom: [],
}

const EMPTY_STATUS: Readonly<Record<Provider, CatalogStatus>> = {
  anthropic: 'idle',
  openai: 'idle',
  google: 'idle',
  xai: 'idle',
  deepseek: 'idle',
  openrouter: 'idle',
  custom: 'idle',
}

export const createModelCatalogSlice: StateCreator<ModelCatalogSlice> = (set) => ({
  catalogModels: EMPTY_PROVIDER_RECORD,
  allowedModels: EMPTY_ALLOWED,
  priceOverrides: {},
  catalogStatus: EMPTY_STATUS,

  setCatalogModels: (provider, models) =>
    set((state) => ({
      catalogModels: { ...state.catalogModels, [provider]: models },
    })),

  setAllowedModels: (provider, modelIds) =>
    set((state) => ({
      allowedModels: { ...state.allowedModels, [provider]: modelIds },
    })),

  setPriceOverride: (modelId, override) =>
    set((state) => ({
      priceOverrides: { ...state.priceOverrides, [modelId]: override },
    })),

  removePriceOverride: (modelId) =>
    set((state) => {
      const { [modelId]: _, ...rest } = state.priceOverrides
      return { priceOverrides: rest }
    }),

  setCatalogStatus: (provider, status) =>
    set((state) => ({
      catalogStatus: { ...state.catalogStatus, [provider]: status },
    })),
})
