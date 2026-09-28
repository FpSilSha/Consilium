import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'
import { buildPricingIndex } from '@/services/api/catalog/pricing-index'

export interface ResolvedPrice {
  readonly input: number
  readonly output: number
  readonly isKnown: boolean
}

/** Unknown pricing is never treated as free. Prices remain usage estimates. */
export function resolvePrice(modelId: string): ResolvedPrice {
  const state = useStore.getState()
  const override = state.priceOverrides[modelId]
  if (override != null && Number.isFinite(override.input) && Number.isFinite(override.output) && override.input >= 0 && override.output >= 0) {
    return { ...override, isKnown: true }
  }
  // Prefer native prices (e.g. xAI) over another provider's routing prices.
  for (const models of Object.values(state.catalogModels)) {
    const match = models.find((model) => model.id === modelId && model.pricingKnown !== false)
    if (match != null) return { input: match.inputPricePerToken, output: match.outputPricePerToken, isKnown: true }
  }
  const reference = buildPricingIndex(state.catalogModels.openrouter ?? []).get(modelId)
  if (reference != null && reference.pricingKnown !== false) {
    return { input: reference.input, output: reference.output, isKnown: true }
  }
  const fallback = getModelById(modelId)
  if (fallback != null && fallback.pricingKnown !== false) {
    return { input: fallback.inputPricePerToken, output: fallback.outputPricePerToken, isKnown: true }
  }
  return { input: 0, output: 0, isKnown: false }
}
