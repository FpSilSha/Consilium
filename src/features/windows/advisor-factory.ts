import { v4 as uuidv4 } from 'uuid'
import type { AdvisorWindow, ApiKey, Persona, Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { getAccentColor, BUILT_IN_THEMES } from '@/features/themes'
import { getModelsForProvider } from '@/features/modelSelector/model-registry'

export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6' as const

/**
 * Picks the cheapest available model for a provider.
 * Checks allowed models first, then full catalog, then static registry.
 * "Cheapest" = lowest output price per token (the dominant cost factor).
 */
function pickCheapestModel(provider: Provider): string {
  const state = useStore.getState()
  const catalog = state.catalogModels[provider] ?? []
  const allowed = state.allowedModels[provider] ?? []

  let candidates: readonly ModelInfo[]

  if (allowed.length > 0) {
    // Curated list — filter catalog to only allowed models
    candidates = catalog.filter((m) => allowed.includes(m.id))
    if (candidates.length === 0) {
      // Allowed IDs don't match catalog — try static
      const staticModels = getModelsForProvider(provider)
      candidates = staticModels.filter((m) => allowed.includes(m.id))
    }
  } else {
    // No curation — use full catalog or static fallback
    candidates = catalog.length > 0 ? catalog : getModelsForProvider(provider)
  }

  if (candidates.length === 0) return DEFAULT_MODEL_ID

  // Sort by output price ascending, pick cheapest with price > 0
  // (price 0 means unknown — prefer known pricing)
  const withPrice = candidates.filter((m) => m.outputPricePerToken > 0)
  if (withPrice.length > 0) {
    const sorted = [...withPrice].sort((a, b) => a.outputPricePerToken - b.outputPricePerToken)
    return sorted[0]!.id
  }

  // All prices unknown — just pick the first
  return candidates[0]!.id
}

/**
 * Creates a new AdvisorWindow with sensible defaults.
 * Single source of truth for advisor creation across the app.
 * Picks the cheapest available model for the provider.
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
  const firstKey = keys[0]
  const provider = firstKey?.provider ?? 'anthropic'
  const model = pickCheapestModel(provider)

  return {
    id: uuidv4(),
    provider,
    keyId: firstKey?.id ?? '',
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
