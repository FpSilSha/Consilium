import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'

export interface ResolvedPrice {
  readonly input: number
  readonly output: number
  /**
   * True when the model was found in any catalog/registry tier (even with
   * a price of 0 — that means the model is genuinely free, not unknown).
   * False only when the model fell through every tier without a match,
   * which is the "we have no idea what this costs" state.
   */
  readonly isKnown: boolean
}

/**
 * Resolves pricing for a model ID using the fallback chain:
 *
 * 1. User price override (manual entry in config modal)
 * 2. OpenRouter catalog (cross-provider reference)
 * 3. Provider catalog (from direct API fetch)
 * 4. Static registry (hardcoded fallback)
 * 5. Unknown (returns isKnown: false, prices 0)
 *
 * Each tier returns its match if found, regardless of whether the price is 0.
 * A free model is a real, known price — `arcee-ai/trinity-large-preview:free`
 * has prices 0/0 in the OpenRouter catalog and that is the authoritative
 * answer, not a placeholder for missing data.
 *
 * Reads a point-in-time snapshot from the store. If the catalog is still
 * loading, earlier tiers may be empty and the chain falls through — callers
 * should check `isKnown` to distinguish "confirmed free" from "no data yet".
 */
export function resolvePrice(modelId: string): ResolvedPrice {
  const state = useStore.getState()

  // 1. User override — only counts as a hit if at least one side is non-zero,
  // since 0/0 overrides aren't a thing the UI can actually set (the editor
  // requires entering a number, blank means "no override").
  const override = state.priceOverrides[modelId]
  if (override != null && (override.input > 0 || override.output > 0)) {
    return { input: override.input, output: override.output, isKnown: true }
  }

  // 2. OpenRouter catalog — exact match wins, then suffix match.
  // Trust any hit, even if the price is 0 (free models).
  const orModels = state.catalogModels['openrouter'] ?? []
  const orExact = orModels.find((m) => m.id === modelId)
  if (orExact != null) {
    return { input: orExact.inputPricePerToken, output: orExact.outputPricePerToken, isKnown: true }
  }
  const orSuffix = orModels.find((m) => {
    const slash = m.id.indexOf('/')
    return slash !== -1 && m.id.slice(slash + 1) === modelId
  })
  if (orSuffix != null) {
    return { input: orSuffix.inputPricePerToken, output: orSuffix.outputPricePerToken, isKnown: true }
  }

  // 3. Provider catalog (already enriched, but check in case enrichment missed)
  for (const provider of Object.keys(state.catalogModels)) {
    if (provider === 'openrouter') continue
    const models = state.catalogModels[provider as keyof typeof state.catalogModels] ?? []
    const match = models.find((m) => m.id === modelId)
    if (match != null) {
      return { input: match.inputPricePerToken, output: match.outputPricePerToken, isKnown: true }
    }
  }

  // 4. Static registry
  const staticModel = getModelById(modelId)
  if (staticModel != null) {
    return {
      input: staticModel.inputPricePerToken,
      output: staticModel.outputPricePerToken,
      isKnown: true,
    }
  }

  // 5. Unknown
  return { input: 0, output: 0, isKnown: false }
}
