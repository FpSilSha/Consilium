import type { CostMetadata } from '@/types'
import type { TokenUsage } from './types'
import { resolvePrice } from '@/features/modelCatalog/price-resolver'

/**
 * Builds cost metadata from token usage and model pricing.
 * Uses the pricing fallback chain: user override > OpenRouter > catalog > static > 0.
 */
export function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
): CostMetadata | undefined {
  if (tokenUsage === undefined) return undefined

  const price = resolvePrice(modelId)
  const inputCost = tokenUsage.inputTokens * price.input
  const outputCost = tokenUsage.outputTokens * price.output

  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    estimatedCost: inputCost + outputCost,
    isEstimate: price.input === 0 && price.output === 0,
  }
}
