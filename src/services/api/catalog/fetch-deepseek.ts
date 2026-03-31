import type { CatalogFetchResult } from './catalog-types'
import { fetchOpenAICompatibleCatalog } from './fetch-openai-compat'

const ENDPOINT = 'https://api.deepseek.com/v1/models'

export function fetchDeepSeekCatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  return fetchOpenAICompatibleCatalog('deepseek', ENDPOINT, apiKey, signal)
}
