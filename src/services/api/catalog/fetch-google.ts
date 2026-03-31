import type { ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { CATALOG_FETCH_TIMEOUT_MS } from './fetch-openai-compat'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Google uses X-Goog-Api-Key header auth and a different response shape.
 * Model names come as `models/gemini-2.0-flash` — we strip the prefix.
 */
export async function fetchGoogleCatalog(
  apiKey: string,
  signal?: AbortSignal,
): Promise<CatalogFetchResult> {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { 'X-Goog-Api-Key': apiKey },
      signal: signal ?? AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { provider: 'google', models: [], error: `HTTP ${response.status}` }
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return { provider: 'google', models: [], error: 'Invalid JSON response' }
    }

    if (!isValidResponse(json)) {
      return { provider: 'google', models: [], error: 'Invalid response shape' }
    }

    const models: readonly ModelInfo[] = (json as { models: readonly unknown[] }).models
      .filter(isGoogleModelEntry)
      .map((raw): ModelInfo => {
        const m = raw as { name: string; displayName?: string; inputTokenLimit?: number }
        const id = m.name.startsWith('models/') ? m.name.slice(7) : m.name
        return {
          id,
          name: m.displayName ?? id,
          provider: 'google',
          contextWindow: m.inputTokenLimit ?? 0,
          inputPricePerToken: 0,
          outputPricePerToken: 0,
        }
      })

    return { provider: 'google', models }
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') throw err
      if (err.name === 'TimeoutError') return { provider: 'google', models: [], error: 'Timeout' }
    }
    return { provider: 'google', models: [], error: 'Network error' }
  }
}

function isValidResponse(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  return Array.isArray((json as Record<string, unknown>)['models'])
}

function isGoogleModelEntry(entry: unknown): boolean {
  return entry != null && typeof entry === 'object' && typeof (entry as Record<string, unknown>)['name'] === 'string'
}
