import type { Provider, ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { catalogJson, entries, positiveNumber, runCatalogFetch } from './catalog-request'
export { CATALOG_FETCH_TIMEOUT_MS } from './catalog-request'

/** OpenAI and DeepSeek share the data-array model-list format. */
export function fetchOpenAICompatibleCatalog(
  provider: Provider,
  endpoint: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<CatalogFetchResult> {
  return runCatalogFetch(provider, async (requestSignal) => {
    const json = await catalogJson(endpoint, { Authorization: 'Bearer ' + apiKey }, requestSignal)
    return entries(json, 'data').flatMap((raw): ModelInfo[] => {
      const id = raw['id']
      if (typeof id !== 'string' || id.trim() === '') return []
      return [{
        id, name: typeof raw['name'] === 'string' ? raw['name'] : id, provider,
        contextWindow: positiveNumber(raw['context_length']),
        inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false,
      }]
    })
  }, signal)
}
