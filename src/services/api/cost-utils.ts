import type { CostMetadata } from '@/types'
import type { TokenUsage } from './types'
import { getModelById } from '@/features/modelSelector/model-registry'

/**
 * Builds cost metadata from token usage and model pricing info.
 * Shared utility used by turn-dispatcher and agent-exchange.
 */
export function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
): CostMetadata | undefined {
  if (tokenUsage === undefined) return undefined

  const model = getModelById(modelId)
  const inputCost = tokenUsage.inputTokens * (model?.inputPricePerToken ?? 0)
  const outputCost = tokenUsage.outputTokens * (model?.outputPricePerToken ?? 0)

  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    estimatedCost: inputCost + outputCost,
    isEstimate: model === undefined,
  }
}
