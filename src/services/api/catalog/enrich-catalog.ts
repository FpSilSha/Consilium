import type { ModelInfo } from '@/types'
import type { PricingEntry } from './pricing-index'

/** OpenRouter provides reference estimates; native metadata and known prices win. */
export function enrichCatalog(models: readonly ModelInfo[], pricingIndex: ReadonlyMap<string, PricingEntry>): readonly ModelInfo[] {
  return models.map((model) => {
    const reference = pricingIndex.get(model.id)
    if (reference == null) return model
    const ownPriceKnown = model.pricingKnown ?? (model.inputPricePerToken > 0 || model.outputPricePerToken > 0)
    const usePrice = (!ownPriceKnown || model.pricingSource === 'reference' || model.pricingSource === 'fallback') && reference.pricingKnown !== false
    return {
      ...model,
      ...(usePrice ? { inputPricePerToken: reference.input, outputPricePerToken: reference.output, pricingKnown: true, pricingSource: 'reference' as const } : {}),
      contextWindow: model.contextWindow > 0 ? model.contextWindow : reference.contextWindow,
    }
  })
}
