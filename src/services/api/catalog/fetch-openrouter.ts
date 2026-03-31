import type { ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { CATALOG_FETCH_TIMEOUT_MS } from './fetch-openai-compat'

const ENDPOINT = 'https://openrouter.ai/api/v1/models'

interface OpenRouterModel {
  readonly id: string
  readonly name: string
  readonly context_length?: number
  readonly pricing?: {
    readonly prompt?: string
    readonly completion?: string
  }
}

/**
 * Fetches the full model catalog from OpenRouter.
 * No API key required — the models endpoint is public.
 * Includes pricing data used to enrich other providers.
 */
export async function fetchOpenRouterCatalog(
  signal?: AbortSignal,
): Promise<CatalogFetchResult> {
  try {
    const response = await fetch(ENDPOINT, {
      signal: signal ?? AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { provider: 'openrouter', models: [], error: `HTTP ${response.status}` }
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return { provider: 'openrouter', models: [], error: 'Invalid JSON response' }
    }

    if (!isValidResponse(json)) {
      return { provider: 'openrouter', models: [], error: 'Invalid response shape' }
    }

    const models: readonly ModelInfo[] = (json as { data: readonly unknown[] }).data
      .filter(isOpenRouterEntry)
      .map((raw): ModelInfo => {
        const m = raw as OpenRouterModel
        return {
          id: m.id,
          name: m.name,
          provider: 'openrouter',
          contextWindow: m.context_length ?? 4096,
          inputPricePerToken: parsePrice(m.pricing?.prompt),
          outputPricePerToken: parsePrice(m.pricing?.completion),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return { provider: 'openrouter', models }
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') throw err
      if (err.name === 'TimeoutError') return { provider: 'openrouter', models: [], error: 'Timeout' }
    }
    return { provider: 'openrouter', models: [], error: 'Network error' }
  }
}

function parsePrice(s: string | undefined): number {
  const n = parseFloat(s ?? '0')
  return Number.isFinite(n) ? n : 0
}

function isValidResponse(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  return Array.isArray((json as Record<string, unknown>)['data'])
}

function isOpenRouterEntry(entry: unknown): boolean {
  if (entry == null || typeof entry !== 'object') return false
  const obj = entry as Record<string, unknown>
  return typeof obj['id'] === 'string' && obj['id'] !== '' && typeof obj['name'] === 'string'
}
