import type { CostMetadata } from '@/types'
import type { TokenUsage } from './types'
import { resolvePrice } from '@/features/modelCatalog/price-resolver'

/**
 * Builds cost metadata from API-returned token usage and resolved pricing.
 *
 * Pricing fallback chain (via resolvePrice):
 *   user override > OpenRouter catalog > provider catalog > static registry > unknown
 *
 * `isEstimate` reflects whether the resolved price came from an authoritative
 * catalog source (`false`) or fell through to the unknown tier (`true`). A
 * free model with a known catalog entry is NOT an estimate — we know the cost
 * is exactly $0.
 *
 * Returns undefined when the API didn't return token counts AND the model
 * isn't known to be free. For known-free models we return a confirmed $0
 * cost even without token data, because the cost is exactly zero regardless
 * of token volume. This matters for partial/cut-off messages where the
 * stream was aborted before any usage event arrived.
 */
export function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
): CostMetadata | undefined {
  const price = resolvePrice(modelId)

  if (tokenUsage == null) {
    // No usage data — but if we KNOW the model is free, the cost is still $0.
    // Return a confirmed-zero metadata so the message isn't classified as
    // "unknown" in the cost breakdown.
    if (price.isKnown && price.input === 0 && price.output === 0) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        isEstimate: false,
      }
    }
    return undefined
  }

  const inputCost = tokenUsage.inputTokens * price.input
  const outputCost = tokenUsage.outputTokens * price.output

  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    estimatedCost: inputCost + outputCost,
    isEstimate: !price.isKnown,
  }
}
