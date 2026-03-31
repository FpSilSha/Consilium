import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'

/**
 * Resolves pricing for a model ID using the fallback chain:
 *
 * 1. User price override (manual entry in config modal)
 * 2. OpenRouter catalog (cross-provider reference)
 * 3. Provider catalog (from direct API fetch)
 * 4. Static registry (hardcoded fallback)
 * 5. Zero (unknown)
 *
 * Reads a point-in-time snapshot from the store. If the catalog is
 * still loading, earlier tiers may be empty and the chain falls through
 * to static or zero — callers should check isEstimate on the result.
 */
export function resolvePrice(modelId: string): { readonly input: number; readonly output: number } {
  const state = useStore.getState()

  // 1. User override
  const override = state.priceOverrides[modelId]
  if (override != null && (override.input > 0 || override.output > 0)) {
    return { input: override.input, output: override.output }
  }

  // 2. OpenRouter catalog — try exact match, then suffix match
  const orModels = state.catalogModels['openrouter'] ?? []
  const orExact = orModels.find((m) => m.id === modelId)
  if (orExact != null && (orExact.inputPricePerToken > 0 || orExact.outputPricePerToken > 0)) {
    return { input: orExact.inputPricePerToken, output: orExact.outputPricePerToken }
  }
  // Suffix match: OpenRouter uses "provider/model" format
  const orSuffix = orModels.find((m) => {
    const slash = m.id.indexOf('/')
    return slash !== -1 && m.id.slice(slash + 1) === modelId
  })
  if (orSuffix != null && (orSuffix.inputPricePerToken > 0 || orSuffix.outputPricePerToken > 0)) {
    return { input: orSuffix.inputPricePerToken, output: orSuffix.outputPricePerToken }
  }

  // 3. Provider catalog (already enriched, but check in case enrichment missed)
  for (const provider of Object.keys(state.catalogModels)) {
    if (provider === 'openrouter') continue
    const models = state.catalogModels[provider as keyof typeof state.catalogModels] ?? []
    const match = models.find((m) => m.id === modelId)
    if (match != null && (match.inputPricePerToken > 0 || match.outputPricePerToken > 0)) {
      return { input: match.inputPricePerToken, output: match.outputPricePerToken }
    }
  }

  // 4. Static registry
  const staticModel = getModelById(modelId)
  if (staticModel != null && (staticModel.inputPricePerToken > 0 || staticModel.outputPricePerToken > 0)) {
    return { input: staticModel.inputPricePerToken, output: staticModel.outputPricePerToken }
  }

  // 5. Unknown
  return { input: 0, output: 0 }
}
