import type { ModelInfo } from '@/types'

export interface PricingEntry {
  readonly input: number
  readonly output: number
  readonly contextWindow: number
}

/**
 * Builds a lookup map from OpenRouter's model catalog for cross-provider
 * pricing enrichment. Creates two indexes:
 *
 * 1. Exact match by full OpenRouter ID (e.g. "anthropic/claude-sonnet-4.6")
 * 2. Suffix match by stripping the provider prefix (e.g. "claude-sonnet-4.6")
 *
 * The suffix index allows matching provider-native model IDs against
 * OpenRouter's prefixed format.
 */
export function buildPricingIndex(
  openRouterModels: readonly ModelInfo[],
): ReadonlyMap<string, PricingEntry> {
  const index = new Map<string, PricingEntry>()

  for (const m of openRouterModels) {
    const entry: PricingEntry = {
      input: m.inputPricePerToken,
      output: m.outputPricePerToken,
      contextWindow: m.contextWindow,
    }

    // Full OpenRouter ID (e.g. "anthropic/claude-sonnet-4.6")
    index.set(m.id, entry)

    // Stripped suffix (e.g. "claude-sonnet-4.6") for cross-provider matching
    const slashIndex = m.id.indexOf('/')
    if (slashIndex !== -1) {
      const suffix = m.id.slice(slashIndex + 1)
      // First entry wins for suffixes. In theory two providers could share
      // a suffix (e.g. "gpt-4o"), but in practice provider-native IDs are
      // distinct. If this becomes an issue, add provider-qualified lookups.
      if (!index.has(suffix)) {
        index.set(suffix, entry)
      }
    }
  }

  return index
}
