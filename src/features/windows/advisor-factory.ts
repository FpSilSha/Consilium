import { v4 as uuidv4 } from 'uuid'
import type { AdvisorWindow, ApiKey, Persona, Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { getAccentColor, BUILT_IN_THEMES } from '@/features/themes'
import { resolveModelsForProvider } from '@/features/modelSelector/model-resolve'
import { refreshProviderCatalog } from '@/services/api/catalog/fetch-all-catalogs'

/**
 * Returns the available models for a provider, respecting the allowed-models filter.
 * Uses the offline shortlist until discovery succeeds.
 */
function getAvailableModels(provider: Provider): readonly ModelInfo[] {
  const models = resolveModelsForProvider(provider)
  const allowed = useStore.getState().allowedModels[provider]
  return allowed.length === 0 ? models : models.filter((model) => allowed.includes(model.id))
}
/**
 * Picks the cheapest model from a list.
 * Models with price 0 are genuinely free (cheapest possible).
 * Models marked with unknown pricing
 * and deprioritized. All others are sorted by output price ascending.
 */
function cheapestFromList(models: readonly ModelInfo[]): ModelInfo | undefined {
  if (models.length === 0) return undefined

  // Free models (price === 0) are the cheapest — pick first one found
  const free = models.filter((m) => m.pricingKnown !== false && m.inputPricePerToken === 0 && m.outputPricePerToken === 0)
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
  await Promise.all([...providerKeys.keys()].filter((provider) => provider !== 'custom').map(async (provider) => {
    if (useStore.getState().catalogStatus[provider] === 'loaded') return
    try { await refreshProviderCatalog(provider) } catch { /* Offline fallback remains available. */ }
  }))
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

    const price = cheapest.pricingKnown === false ? Infinity : cheapest.outputPricePerToken
    if (price < bestPrice) {
      bestPrice = price
      bestProvider = provider
      bestKeyId = key.id
      bestModel = cheapest.id
    }
  }

  // Unknown prices remain usable, but a successful empty catalog is not a model choice.
  if (bestPrice === Infinity && providerKeys.size > 0) {
    const available = [...providerKeys.entries()].find(([provider]) => getAvailableModels(provider).length > 0)
    const [provider, key] = available ?? [...providerKeys.entries()][0]!
    bestProvider = provider
    bestKeyId = key.id
    bestModel = getAvailableModels(provider)[0]?.id ?? ''
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
  _personas: readonly Persona[],
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

  const { provider, keyId, model } = pickBestProviderAndModel(keys)

  return {
    id: uuidv4(),
    provider,
    keyId,
    model,
    // Default new advisors to "No Persona" — users opt in to a lens via the dropdown.
    personaId: '',
    personaLabel: 'No Persona',
    accentColor,
    runningCost: 0,
    isStreaming: false,
    streamContent: '',
    error: model === '' ? 'No compatible model available. Check Models & Keys.' : null,
    isCompacted: false,
    compactedSummary: null,
    bufferSize: 15,
  }
}
