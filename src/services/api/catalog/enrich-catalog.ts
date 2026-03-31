import type { ModelInfo } from '@/types'
import type { PricingEntry } from './pricing-index'

/**
 * Enriches a provider's model catalog with pricing and context window
 * data from the OpenRouter pricing index.
 *
 * Only fills in fields that are zero (unknown). Existing non-zero values
 * are preserved — they come from the provider's own API response.
 */
export function enrichCatalog(
  models: readonly ModelInfo[],
  pricingIndex: ReadonlyMap<string, PricingEntry>,
): readonly ModelInfo[] {
  return models.map((m) => {
    if (m.inputPricePerToken > 0 && m.outputPricePerToken > 0 && m.contextWindow > 0) {
      return m // already has full data
    }

    const pricing = pricingIndex.get(m.id)
    if (pricing == null) return m

    return {
      ...m,
      inputPricePerToken: m.inputPricePerToken > 0 ? m.inputPricePerToken : pricing.input,
      outputPricePerToken: m.outputPricePerToken > 0 ? m.outputPricePerToken : pricing.output,
      contextWindow: m.contextWindow > 0 ? m.contextWindow : pricing.contextWindow,
    }
  })
}
