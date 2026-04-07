import type { ModelInfo } from '@/types'
import { useStore } from '@/store'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const FETCH_TIMEOUT_MS = 15_000

interface OpenRouterModel {
  readonly id: string
  readonly name: string
  readonly context_length?: number
  readonly pricing?: {
    readonly prompt?: string
    readonly completion?: string
  }
}

interface OpenRouterModelsResponse {
  readonly data: readonly OpenRouterModel[]
}

// Deduplicates concurrent fetches
let pendingFetch: Promise<readonly ModelInfo[]> | null = null

function parsePrice(s: string | undefined): number {
  const n = parseFloat(s ?? '0')
  return Number.isFinite(n) ? n : 0
}

/**
 * Fetches the OpenRouter model catalog without authentication.
 * The /v1/models endpoint is public — no key required.
 * Called on app startup so pricing is available before any advisor streams.
 */
export async function fetchOpenRouterCatalogPublic(): Promise<readonly ModelInfo[]> {
  const cached = useStore.getState().catalogModels['openrouter'] ?? []
  if (cached.length > 0) return cached
  if (pendingFetch != null) return pendingFetch

  pendingFetch = doFetch(null).finally(() => { pendingFetch = null })
  return pendingFetch
}

/**
 * Fetches the full model list from OpenRouter's API.
 * Optionally authenticated — key adds rate limit headroom but is not required.
 * Results are cached in the Zustand store. Concurrent calls are deduplicated.
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<readonly ModelInfo[]> {
  const cached = useStore.getState().catalogModels['openrouter'] ?? []
  if (cached.length > 0) return cached
  if (pendingFetch != null) return pendingFetch

  pendingFetch = doFetch(apiKey).finally(() => { pendingFetch = null })
  return pendingFetch
}

async function doFetch(apiKey: string | null): Promise<readonly ModelInfo[]> {
  try {
    const headers: Record<string, string> = {}
    if (apiKey != null) headers['Authorization'] = `Bearer ${apiKey}`

    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!response.ok) return []

    const json: unknown = await response.json()
    if (!isValidResponse(json)) return []

    const models = json.data
      .filter((m) => m.id !== '' && m.name !== '')
      .map((m): ModelInfo => ({
        id: m.id,
        name: m.name,
        provider: 'openrouter',
        contextWindow: m.context_length ?? 4096,
        inputPricePerToken: parsePrice(m.pricing?.prompt),
        outputPricePerToken: parsePrice(m.pricing?.completion),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    useStore.getState().setCatalogModels('openrouter', models)
    return models
  } catch {
    return []
  }
}

function isValidResponse(json: unknown): json is OpenRouterModelsResponse {
  if (typeof json !== 'object' || json === null) return false
  const obj = json as Record<string, unknown>
  return Array.isArray(obj['data'])
}
