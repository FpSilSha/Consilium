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
 * Prefers models with known pricing (price > 0) over unknown pricing.
 */
function cheapestFromList(models: readonly ModelInfo[]): ModelInfo | undefined {
  if (models.length === 0) return undefined

  const withPrice = models.filter((m) => m.outputPricePerToken > 0)
  if (withPrice.length > 0) {
    return [...withPrice].sort((a, b) => a.outputPricePerToken - b.outputPricePerToken)[0]
  }

  return models[0]
}

/**
 * Triggers background catalog fetches for providers that have keys but
 * no cached catalog. This ensures the catalog will be available for the
 * next "Add Advisor" click even if it's not ready for the current one.
 */
function triggerMissingCatalogFetches(providerKeys: ReadonlyMap<Provider, ApiKey>): void {
  for (const [provider, key] of providerKeys) {
    const catalog = useStore.getState().catalogModels[provider] ?? []
    if (catalog.length > 0) continue

    // Only OpenRouter needs a dynamic fetch — others use the static registry
    if (provider === 'openrouter') {
      const rawKey = getRawKey(key.id)
      if (rawKey == null) continue
      import('@/features/modelSelector/openrouter-models')
        .then((mod) => mod.fetchOpenRouterModels(rawKey))
        .catch(() => { /* non-fatal — catalog stays empty until next attempt */ })
    }
  }
}

/**
 * Picks the best provider and cheapest model across all providers that have keys.
 * Returns the provider with the cheapest available model.
 */
function pickBestProviderAndModel(keys: readonly ApiKey[]): { readonly provider: Provider; readonly keyId: string; readonly model: string } {
  // Get unique providers that have keys
  const providerKeys = new Map<Provider, ApiKey>()
  for (const key of keys) {
    if (!providerKeys.has(key.provider as Provider)) {
      providerKeys.set(key.provider as Provider, key)
    }
  }

  // Fire-and-forget: ensure catalogs are loading for future Add Advisor clicks
  triggerMissingCatalogFetches(providerKeys)

  let bestProvider: Provider = 'anthropic'
  let bestKeyId = ''
  let bestModel = 'claude-sonnet-4-6'
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
    bestModel = models[0]?.id ?? 'claude-sonnet-4-6'
  }

  return { provider: bestProvider, keyId: bestKeyId, model: bestModel }
}

/**
 * Creates a new AdvisorWindow with sensible defaults.
 * Single source of truth for advisor creation across the app.
 * Picks the cheapest available model across all providers that have keys.
 */
export function createDefaultAdvisorWindow(
  windowOrder: readonly string[],
  personas: readonly Persona[],
  keys: readonly ApiKey[],
): AdvisorWindow {
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
