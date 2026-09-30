import type { ModelInfo, Provider } from '@/types'
import type { CatalogFetchResult } from './catalog-types'

export const CATALOG_FETCH_TIMEOUT_MS = 15_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function strings(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined
}

export function positiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function priceNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export class CatalogError extends Error {}

export async function catalogJson(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers, signal })
  if (!response.ok) throw new CatalogError(
    response.status === 401 || response.status === 403 ? 'Authentication failed — check your API key'
      : response.status === 429 ? 'Rate limited — try again shortly'
        : 'HTTP ' + response.status,
  )
  let json: unknown
  try { json = await response.json() } catch {
    signal.throwIfAborted()
    throw new CatalogError('Invalid JSON response')
  }
  if (!isRecord(json)) throw new CatalogError('Invalid response shape')
  return json
}

export function entries(json: Record<string, unknown>, field: string): readonly Record<string, unknown>[] {
  const value = json[field]
  if (!Array.isArray(value)) throw new CatalogError('Invalid response shape')
  return value.filter(isRecord)
}

export function uniqueModels(models: readonly ModelInfo[]): readonly ModelInfo[] {
  const unique = new Map<string, ModelInfo>()
  for (const model of models) if (!unique.has(model.id)) unique.set(model.id, model)
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function runCatalogFetch(
  provider: Provider,
  load: (signal: AbortSignal) => Promise<readonly ModelInfo[]>,
  signal?: AbortSignal,
  timeoutMs = CATALOG_FETCH_TIMEOUT_MS,
): Promise<CatalogFetchResult> {
  const deadline = AbortSignal.timeout(timeoutMs)
  const combined = signal == null ? deadline : AbortSignal.any([signal, deadline])
  try {
    combined.throwIfAborted()
    const models = await load(combined)
    combined.throwIfAborted()
    return { provider, models: uniqueModels(models) }
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    return { provider, models: [], error: deadline.aborted ? 'Model catalog request timed out'
      : error instanceof CatalogError ? error.message : 'Could not reach the model catalog' }
  }
}
