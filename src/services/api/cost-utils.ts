import type { CostMetadata } from '@/types'
import type { TokenUsage } from './types'
import { resolvePrice } from '@/features/modelCatalog/price-resolver'

/**
 * Builds cost metadata from API-returned token usage and resolved pricing.
 *
 * Pricing fallback chain (via resolvePrice):
 *   user override > OpenRouter catalog > provider catalog > static registry > unknown
 *
 * If the API didn't return token counts, returns undefined — we don't estimate.
 *
 * `isEstimate` reflects whether the resolved price came from an authoritative
 * catalog source (`false`) or fell through to the unknown tier (`true`). A
 * free model with a known catalog entry is NOT an estimate — we know the cost
 * is exactly $0.
 */
export function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
): CostMetadata | undefined {
  if (tokenUsage == null) return undefined

  const price = resolvePrice(modelId)
  const inputCost = tokenUsage.inputTokens * price.input
  const outputCost = tokenUsage.outputTokens * price.output

  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    estimatedCost: inputCost + outputCost,
    isEstimate: !price.isKnown,
  }
}
