import type { CostMetadata } from '@/types'
import type { TokenUsage } from './types'
import { resolvePrice } from '@/features/modelCatalog/price-resolver'

/**
 * Builds cost metadata from API-returned token usage and resolved pricing.
 *
 * Pricing fallback chain (via resolvePrice):
 *   user override > OpenRouter catalog > provider catalog > static registry > 0
 *
 * If the API didn't return token counts, returns undefined — we don't estimate.
 */
export function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
): CostMetadata | undefined {
  if (tokenUsage == null) return undefined
  if (tokenUsage.inputTokens === 0 && tokenUsage.outputTokens === 0) return undefined

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
