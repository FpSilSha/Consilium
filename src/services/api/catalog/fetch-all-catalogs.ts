import type { Provider } from '@/types'
import { useStore } from '@/store'
import { getRawKey } from '@/features/keys/key-vault'
import { fetchOpenAICatalog } from './fetch-openai'
import { fetchGoogleCatalog } from './fetch-google'
import { fetchXAICatalog } from './fetch-xai'
import { fetchDeepSeekCatalog } from './fetch-deepseek'
import { fetchOpenRouterCatalog } from './fetch-openrouter'
import { buildPricingIndex } from './pricing-index'
import { enrichCatalog } from './enrich-catalog'
import type { CatalogFetchResult } from './catalog-types'
import { getAllModels } from '@/features/modelSelector/model-registry'

type FetchableDirect = 'openai' | 'google' | 'xai' | 'deepseek'

const DIRECT_FETCHERS: Readonly<Record<FetchableDirect, (apiKey: string, signal?: AbortSignal) => Promise<CatalogFetchResult>>> = {
  openai: fetchOpenAICatalog,
  google: fetchGoogleCatalog,
  xai: fetchXAICatalog,
  deepseek: fetchDeepSeekCatalog,
}

/**
 * Fetches model catalogs from all providers in parallel on startup.
 *
 * 1. OpenRouter first (public, no auth) — used as pricing reference
 * 2. Direct providers in parallel (only those with configured keys)
 * 3. Anthropic: static registry only (no listing endpoint)
 * 4. Enrich all results with OpenRouter pricing
 * 5. Write to store — failures fall back to static registry per provider
 */
export async function fetchAllCatalogs(signal?: AbortSignal): Promise<void> {
  const state = useStore.getState()
  const { setCatalogModels, setCatalogStatus } = state

  // 1. Fetch OpenRouter catalog (public, no auth needed)
  setCatalogStatus('openrouter', 'loading')
  const openRouterResult = await fetchOpenRouterCatalog(signal).catch((): CatalogFetchResult => ({
    provider: 'openrouter',
    models: [],
    error: 'Fetch failed',
  }))

  if (signal?.aborted) return

  if (openRouterResult.models.length > 0) {
    setCatalogModels('openrouter', openRouterResult.models)
    setCatalogStatus('openrouter', 'loaded')
  } else {
    setCatalogStatus('openrouter', 'error')
  }

  // Build pricing index from OpenRouter data
  const pricingIndex = buildPricingIndex(openRouterResult.models)

  // 2. Anthropic: no listing endpoint — use static registry, enriched
  const anthropicStatic = getAllModels().filter((m) => m.provider === 'anthropic')
  const anthropicEnriched = enrichCatalog(anthropicStatic, pricingIndex)
  setCatalogModels('anthropic', anthropicEnriched)
  setCatalogStatus('anthropic', 'loaded')

  // 3. Fetch direct providers in parallel (only those with a key)
  const fetchPromises: Promise<void>[] = []

  for (const [provider, fetcher] of Object.entries(DIRECT_FETCHERS) as [FetchableDirect, typeof DIRECT_FETCHERS[FetchableDirect]][]) {
    const key = state.keys.find((k) => k.provider === provider)
    if (key == null) continue

    const rawKey = getRawKey(key.id)
    if (rawKey == null) continue

    setCatalogStatus(provider, 'loading')

    const promise = fetcher(rawKey, signal)
      .catch((): CatalogFetchResult => ({
        provider,
        models: [],
        error: 'Fetch failed',
      }))
      .then((result) => {
        if (signal?.aborted) return

        if (result.models.length > 0) {
          const enriched = enrichCatalog(result.models, pricingIndex)
          setCatalogModels(provider, enriched)
          setCatalogStatus(provider, 'loaded')
        } else {
          // Fall back to static registry for this provider
          const staticModels = getAllModels().filter((m) => m.provider === provider)
          const enriched = enrichCatalog(staticModels, pricingIndex)
          setCatalogModels(provider, enriched)
          setCatalogStatus(provider, result.error != null ? 'error' : 'loaded')
        }
      })

    fetchPromises.push(promise)
  }

  await Promise.all(fetchPromises)
}
