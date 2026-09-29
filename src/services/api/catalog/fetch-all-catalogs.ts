import { getModelById } from '@/features/modelSelector/model-registry'
import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { getRawKey } from '@/features/keys/key-vault'
import { fetchAnthropicCatalog } from './fetch-anthropic'
import { fetchOpenAICatalog } from './fetch-openai'
import { fetchGoogleCatalog } from './fetch-google'
import { fetchXAICatalog } from './fetch-xai'
import { fetchDeepSeekCatalog } from './fetch-deepseek'
import { fetchOpenRouterCatalog } from './fetch-openrouter'
import { buildPricingIndex } from './pricing-index'
import { enrichCatalog } from './enrich-catalog'
import { uniqueModels } from './catalog-request'
import type { CatalogFetchResult } from './catalog-types'

export const DIRECT_FETCHERS = {
  anthropic: fetchAnthropicCatalog, openai: fetchOpenAICatalog,
  google: fetchGoogleCatalog, xai: fetchXAICatalog, deepseek: fetchDeepSeekCatalog,
} as const

export async function fetchProviderCatalog(provider: Provider, apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  if (provider === 'openrouter') return fetchOpenRouterCatalog(signal)
  if (provider === 'custom') return { provider, models: [], error: 'Use the custom provider model endpoint' }
  if (provider === 'claude-subscription') return { provider, models: [], error: 'Subscription models come from the local Claude Code runtime' }
  return DIRECT_FETCHERS[provider](apiKey, signal)
}

interface PendingRequest {
  readonly promise: Promise<CatalogFetchResult>
  readonly signal: AbortSignal | undefined
  readonly keyId: string | undefined
}
const pending = new Map<Provider, PendingRequest>()
const generations = new Map<Provider, number>()

/** Shared by startup, onboarding and manual refresh. Failed refreshes retain last good data. */
export function refreshProviderCatalog(provider: Provider, signal?: AbortSignal): Promise<CatalogFetchResult> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  const state = useStore.getState()
  const key = state.keys.find((entry) => entry.provider === provider && getRawKey(entry.id) != null)
  const existing = pending.get(provider)
  if (existing != null && !existing.signal?.aborted && existing.keyId === key?.id) return existing.promise
  const rawKey = key == null ? null : getRawKey(key.id)
  if (provider !== 'openrouter' && rawKey == null) {
    return Promise.resolve({ provider, models: [], error: 'Add an API key first to fetch models' })
  }
  const generation = (generations.get(provider) ?? 0) + 1
  generations.set(provider, generation)
  state.setCatalogStatus(provider, 'loading')
  const promise = fetchProviderCatalog(provider, rawKey ?? '', signal)
    .then((result) => {
      if (signal?.aborted) throw signal.reason
      if (generations.get(provider) !== generation) return result
      const current = useStore.getState()
      if (result.error != null) {
        current.setCatalogStatus(provider, 'error')
        return result
      }
      const models = provider === 'openrouter' ? result.models
        : enrichCatalog(result.models.map(withFallbackMetadata), buildPricingIndex(current.catalogModels.openrouter))
      const custom = current.catalogModels[provider].filter((model) => model.isCustom === true)
      const customIds = new Set(custom.map((model) => model.id))
      const merged = uniqueModels([...models.map((model) => customIds.has(model.id) ? { ...model, isCustom: true } : model), ...custom])
      current.setCatalogModels(provider, merged)
      current.setCatalogStatus(provider, 'loaded')
      if (provider === 'openrouter') enrichLoadedCatalogs(merged)
      return { ...result, models: merged }
    })
    .catch((error: unknown) => {
      if (generations.get(provider) === generation) {
        useStore.getState().setCatalogStatus(provider, signal?.aborted ? 'idle' : 'error')
      }
      if (signal?.aborted) throw signal.reason
      return { provider, models: [], error: 'Could not refresh the model catalog' }
    })
    .finally(() => {
      if (generations.get(provider) === generation) pending.delete(provider)
    })
  pending.set(provider, { promise, signal, keyId: key?.id })
  return promise
}

function enrichLoadedCatalogs(openRouterModels: readonly ModelInfo[]): void {
  const state = useStore.getState()
  const index = buildPricingIndex(openRouterModels)
  for (const provider of Object.keys(DIRECT_FETCHERS) as (keyof typeof DIRECT_FETCHERS)[]) {
    if (state.catalogModels[provider].length > 0) {
      state.setCatalogModels(provider, enrichCatalog(state.catalogModels[provider], index))
    }
  }
}

/** Providers load independently; a slow OpenRouter request does not block the others. */
export async function fetchAllCatalogs(signal?: AbortSignal): Promise<void> {
  const providers = new Set<Provider>(['openrouter'])
  for (const key of useStore.getState().keys) if (key.provider !== 'custom') providers.add(key.provider)
  await Promise.all([...providers].map((provider) => refreshProviderCatalog(provider, signal)))
}

function withFallbackMetadata(model: ModelInfo): ModelInfo {
  const fallback = getModelById(model.id)
  if (fallback == null || fallback.provider !== model.provider) return model
  return {
    ...model,
    contextWindow: model.contextWindow || fallback.contextWindow,
    maxOutputTokens: model.maxOutputTokens ?? fallback.maxOutputTokens,
    ...(model.pricingKnown === false && fallback.pricingKnown !== false
      ? { inputPricePerToken: fallback.inputPricePerToken, outputPricePerToken: fallback.outputPricePerToken, pricingKnown: true, pricingSource: 'fallback' as const }
      : {}),
  }
}