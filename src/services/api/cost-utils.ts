import type { CostMetadata } from '@/types'
import type { TokenUsage } from './types'
import { resolvePrice } from '@/features/modelCatalog/price-resolver'

/** Rough estimate: ~4 characters per token for English text */
const CHARS_PER_TOKEN = 4

/**
 * Builds cost metadata from token usage and model pricing.
 * Uses the pricing fallback chain: user override > OpenRouter > catalog > static > 0.
 *
 * If tokenUsage is undefined (provider didn't return counts), estimates
 * from content length so cost tracking is never completely blank.
 */
export function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
  inputText?: string,
  outputText?: string,
): CostMetadata {
  const price = resolvePrice(modelId)
  const isEstimate = tokenUsage === undefined

  const inputTokens = tokenUsage?.inputTokens ?? estimateTokens(inputText ?? '')
  const outputTokens = tokenUsage?.outputTokens ?? estimateTokens(outputText ?? '')

  const inputCost = inputTokens * price.input
  const outputCost = outputTokens * price.output

  return {
    inputTokens,
    outputTokens,
    estimatedCost: inputCost + outputCost,
    isEstimate: isEstimate || (price.input === 0 && price.output === 0),
  }
}

function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
