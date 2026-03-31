import type { CatalogFetchResult } from './catalog-types'
import { fetchOpenAICompatibleCatalog } from './fetch-openai-compat'

const ENDPOINT = 'https://api.openai.com/v1/models'

export function fetchOpenAICatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  return fetchOpenAICompatibleCatalog('openai', ENDPOINT, apiKey, signal)
}
