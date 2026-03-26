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
 * Fetches the full model list from OpenRouter's API.
 * Requires an API key for authentication.
 * Results are cached in the Zustand store. Concurrent calls are deduplicated.
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<readonly ModelInfo[]> {
  const cached = useStore.getState().openRouterModels
  if (cached.length > 0) return cached
  if (pendingFetch != null) return pendingFetch

  pendingFetch = doFetch(apiKey).finally(() => { pendingFetch = null })
  return pendingFetch
}

async function doFetch(apiKey: string): Promise<readonly ModelInfo[]> {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
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

    useStore.getState().setOpenRouterModels(models)
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
