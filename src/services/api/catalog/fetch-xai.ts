import type { CatalogFetchResult } from './catalog-types'
import { fetchOpenAICompatibleCatalog } from './fetch-openai-compat'

const ENDPOINT = 'https://api.x.ai/v1/models'

export function fetchXAICatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  return fetchOpenAICompatibleCatalog('xai', ENDPOINT, apiKey, signal)
}
