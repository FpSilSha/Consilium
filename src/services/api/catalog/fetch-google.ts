import type { ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { catalogJson, CatalogError, entries, positiveNumber, runCatalogFetch, strings } from './catalog-request'

export function fetchGoogleCatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  return runCatalogFetch('google', async (requestSignal) => {
    const models: ModelInfo[] = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
      url.searchParams.set('pageSize', '1000')
      if (cursor != null) url.searchParams.set('pageToken', cursor)
      const json = await catalogJson(url.toString(), { 'X-Goog-Api-Key': apiKey }, requestSignal)
      for (const raw of entries(json, 'models')) {
        if (typeof raw['name'] !== 'string' || raw['name'].trim() === '') continue
        if (!strings(raw['supportedGenerationMethods'])?.includes('generateContent')) continue
        const id = raw['name'].replace(/^models\//, '')
        // These models use dedicated audio/media request and response formats.
        if (/(?:^|-)(?:image|audio|tts|live|transcribe|robotics|computer-use|omni)(?:-|$)/i.test(id)) continue
        models.push({
          id, name: typeof raw['displayName'] === 'string' ? raw['displayName'] : id,
          provider: 'google', contextWindow: positiveNumber(raw['inputTokenLimit']),
          maxOutputTokens: positiveNumber(raw['outputTokenLimit']) || undefined,
          inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false,
        })
      }
      if (json['nextPageToken'] == null || json['nextPageToken'] === '') break
      cursor = typeof json['nextPageToken'] === 'string' ? json['nextPageToken'] : undefined
      if (!cursor || cursors.has(cursor) || cursors.size >= 100) throw new CatalogError('Invalid catalog pagination cursor')
      cursors.add(cursor)
    } while (true)
    return models
  }, signal)
}
