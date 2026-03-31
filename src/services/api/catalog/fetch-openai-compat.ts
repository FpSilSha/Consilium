import type { Provider, ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'

export const CATALOG_FETCH_TIMEOUT_MS = 15_000

/**
 * Shared fetcher for OpenAI-compatible model list endpoints.
 * Used by OpenAI, xAI, and DeepSeek (same response format).
 */
export async function fetchOpenAICompatibleCatalog(
  provider: Provider,
  endpoint: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<CatalogFetchResult> {
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: signal ?? AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { provider, models: [], error: `HTTP ${response.status}` }
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return { provider, models: [], error: 'Invalid JSON response' }
    }

    if (!isValidDataArray(json)) {
      return { provider, models: [], error: 'Invalid response shape' }
    }

    const models: readonly ModelInfo[] = (json as { data: readonly unknown[] }).data
      .filter(isObjectWithStringId)
      .map((m): ModelInfo => ({
        id: (m as { id: string }).id,
        name: (m as { id: string }).id,
        provider,
        contextWindow: 0,
        inputPricePerToken: 0,
        outputPricePerToken: 0,
      }))

    return { provider, models }
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') throw err // re-throw caller cancellations
      if (err.name === 'TimeoutError') return { provider, models: [], error: 'Timeout' }
    }
    return { provider, models: [], error: 'Network error' }
  }
}

function isValidDataArray(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  return Array.isArray((json as Record<string, unknown>)['data'])
}

function isObjectWithStringId(entry: unknown): boolean {
  return entry != null && typeof entry === 'object' && typeof (entry as Record<string, unknown>)['id'] === 'string' && (entry as Record<string, unknown>)['id'] !== ''
}
