import { v4 as uuidv4 } from 'uuid'
import type { AdvisorWindow, ApiKey, Persona, Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { getAccentColor, BUILT_IN_THEMES } from '@/features/themes'
import { getModelsForProvider } from '@/features/modelSelector/model-registry'
import { getRawKey } from '@/features/keys/key-vault'

/**
 * Returns the available models for a provider, respecting the allowed-models filter.
 * Falls back to the static registry if catalog is empty.
 */
function getAvailableModels(provider: Provider): readonly ModelInfo[] {
  const state = useStore.getState()
  const catalog = state.catalogModels[provider] ?? []
  const allowed = state.allowedModels[provider] ?? []

  if (allowed.length > 0) {
    const filtered = catalog.filter((m) => allowed.includes(m.id))
    if (filtered.length > 0) return filtered
    const staticModels = getModelsForProvider(provider)
    const staticFiltered = staticModels.filter((m) => allowed.includes(m.id))
    if (staticFiltered.length > 0) return staticFiltered
  }

  if (catalog.length > 0) return catalog
  return getModelsForProvider(provider)
}

/**
 * Picks the cheapest model from a list.
 * Models with price 0 are genuinely free (cheapest possible).
 * Models with both input and output price of -1 are treated as unknown pricing
 * and deprioritized. All others are sorted by output price ascending.
 */
function cheapestFromList(models: readonly ModelInfo[]): ModelInfo | undefined {
  if (models.length === 0) return undefined

  // Free models (price === 0) are the cheapest — pick first one found
  const free = models.filter((m) => m.inputPricePerToken === 0 && m.outputPricePerToken === 0)
  if (free.length > 0) return free[0]

  // Among paid models, sort by output price ascending
  const paid = models.filter((m) => m.outputPricePerToken > 0)
  if (paid.length > 0) {
    return [...paid].sort((a, b) => a.outputPricePerToken - b.outputPricePerToken)[0]
  }

  // Fallback — unknown pricing
  return models[0]
}

/**
 * Ensures the catalog is loaded for providers that need dynamic fetching.
 * Awaits the fetch if catalog is empty, so the first Add Advisor click
 * gets real model data instead of a hardcoded fallback.
 */
async function ensureCatalogLoaded(providerKeys: ReadonlyMap<Provider, ApiKey>): Promise<void> {
  for (const [provider, key] of providerKeys) {
    const catalog = useStore.getState().catalogModels[provider] ?? []
    if (catalog.length > 0) continue

    if (provider === 'openrouter') {
      const rawKey = getRawKey(key.id)
      if (rawKey == null) continue
      try {
        const { fetchOpenRouterModels } = await import('@/features/modelSelector/openrouter-models')
        await fetchOpenRouterModels(rawKey)
      } catch { /* non-fatal — will use fallback */ }
    }
  }
}

/**
 * Picks the best provider and cheapest model across all providers that have keys.
 * Returns the provider with the cheapest available model.
 */
function pickBestProviderAndModel(keys: readonly ApiKey[]): { readonly provider: Provider; readonly keyId: string; readonly model: string } {
  const providerKeys = new Map<Provider, ApiKey>()
  for (const key of keys) {
    if (!providerKeys.has(key.provider as Provider)) {
      providerKeys.set(key.provider as Provider, key)
    }
  }

  let bestProvider: Provider = 'anthropic'
  let bestKeyId = ''
  let bestModel = 'claude-haiku-4-5-20251001'
  let bestPrice = Infinity

  for (const [provider, key] of providerKeys) {
    const models = getAvailableModels(provider)
    const cheapest = cheapestFromList(models)
    if (cheapest == null) continue

    const price = cheapest.outputPricePerToken > 0 ? cheapest.outputPricePerToken : Infinity
    if (price < bestPrice) {
      bestPrice = price
      bestProvider = provider
      bestKeyId = key.id
      bestModel = cheapest.id
    }
  }

  // If no provider had priced models, just use the first key's provider and first model
  if (bestPrice === Infinity && providerKeys.size > 0) {
    const [firstProvider, firstKey] = [...providerKeys.entries()][0]!
    const models = getAvailableModels(firstProvider)
    bestProvider = firstProvider
    bestKeyId = firstKey.id
    bestModel = models[0]?.id ?? 'claude-haiku-4-5-20251001'
  }

  return { provider: bestProvider, keyId: bestKeyId, model: bestModel }
}

/**
 * Creates a new AdvisorWindow with sensible defaults.
 * Awaits catalog loading for providers like OpenRouter before picking a model.
 * Picks the cheapest available model across all providers that have keys.
 */
export async function createDefaultAdvisorWindow(
  windowOrder: readonly string[],
  personas: readonly Persona[],
  keys: readonly ApiKey[],
): Promise<AdvisorWindow> {
  // Ensure catalogs are loaded before picking a model
  const providerKeys = new Map<Provider, ApiKey>()
  for (const key of keys) {
    if (!providerKeys.has(key.provider as Provider)) {
      providerKeys.set(key.provider as Provider, key)
    }
  }
  await ensureCatalogLoaded(providerKeys)

  const defaultTheme = BUILT_IN_THEMES[0]!
  const accentColor = getAccentColor(
    windowOrder.length,
    defaultTheme.colors.accentPalette,
  )

  const firstPersona = personas[0]
  const { provider, keyId, model } = pickBestProviderAndModel(keys)

  return {
    id: uuidv4(),
    provider,
    keyId,
    model,
    personaId: firstPersona?.id ?? '',
    personaLabel: firstPersona?.name ?? 'Advisor',
    accentColor,
    runningCost: 0,
    isStreaming: false,
    streamContent: '',
    error: null,
    isCompacted: false,
    compactedSummary: null,
    bufferSize: 15,
  }
}
