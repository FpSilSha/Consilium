import type { ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { catalogJson, CatalogError, entries, positiveNumber, runCatalogFetch } from './catalog-request'

export function fetchAnthropicCatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  return runCatalogFetch('anthropic', async (requestSignal) => {
    const models: ModelInfo[] = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const url = new URL('https://api.anthropic.com/v1/models')
      url.searchParams.set('limit', '1000')
      if (cursor != null) url.searchParams.set('after_id', cursor)
      const json = await catalogJson(url.toString(), {
        'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }, requestSignal)
      for (const raw of entries(json, 'data')) {
        if (typeof raw['id'] !== 'string' || raw['id'].trim() === '') continue
        models.push({
          id: raw['id'], name: typeof raw['display_name'] === 'string' ? raw['display_name'] : raw['id'],
          provider: 'anthropic', contextWindow: positiveNumber(raw['max_input_tokens']),
          maxOutputTokens: positiveNumber(raw['max_tokens']) || undefined,
          inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false,
        })
      }
      if (json['has_more'] !== true) break
      cursor = typeof json['last_id'] === 'string' ? json['last_id'] : undefined
      if (!cursor || cursors.has(cursor) || cursors.size >= 100) throw new CatalogError('Invalid catalog pagination cursor')
      cursors.add(cursor)
    } while (true)
    return models
  }, signal)
}
