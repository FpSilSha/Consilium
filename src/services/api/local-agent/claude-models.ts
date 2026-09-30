import type { ModelInfo } from '@/types'

/**
 * Models offered for Claude subscription advisors. IDs and limits come from
 * Anthropic's current model table (claude-api reference, cached 2026-09-25).
 * Which of these a given plan can use is decided by the runtime; an
 * unavailable model surfaces as a turn error.
 *
 * Prices are zero with `pricingKnown: false`: subscription usage has no
 * per-call price and must never be presented as free API usage.
 */
const subscriptionModel = (id: string, name: string, contextWindow: number, maxOutputTokens?: number): ModelInfo => ({
  id,
  name: `${name} (subscription)`,
  provider: 'claude-subscription',
  contextWindow,
  inputPricePerToken: 0,
  outputPricePerToken: 0,
  pricingKnown: false,
  ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
})

export const CLAUDE_SUBSCRIPTION_MODELS: readonly ModelInfo[] = [
  subscriptionModel('claude-opus-5-5', 'Claude Opus 5.5', 1_000_000, 128_000),
  subscriptionModel('claude-fable-5-1', 'Claude Fable 5.1', 1_000_000, 128_000),
  subscriptionModel('claude-sonnet-5-5', 'Claude Sonnet 5.5', 1_000_000, 128_000),
  subscriptionModel('claude-haiku-4-5', 'Claude Haiku 4.5', 200_000),
]
