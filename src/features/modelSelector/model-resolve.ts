import type { ModelInfo, Provider } from '@/types'
import { useStore } from '@/store'
import { getModelById } from './model-registry'
import { availableModels } from './available-models'
import { CLAUDE_SUBSCRIPTION_MODELS } from '@/services/api/local-agent/claude-models'

/**
 * Store-aware model lookups.
 * Checks the dynamic catalog first, falls back to static registry.
 */

export function resolveModelById(modelId: string): ModelInfo | undefined {
  const state = useStore.getState()

  // Check all provider catalogs
  for (const provider of Object.keys(state.catalogModels) as Provider[]) {
    const models = state.catalogModels[provider] ?? []
    const match = models.find((m) => m.id === modelId)
    if (match != null) return match
  }

  // Fall back to static registry, then the subscription list (context limits
  // for compaction and display names; never used for pricing).
  return getModelById(modelId) ?? CLAUDE_SUBSCRIPTION_MODELS.find((m) => m.id === modelId)
}

export function resolveModelsForProvider(provider: Provider): readonly ModelInfo[] {
  const state = useStore.getState()
  const catalogModels = state.catalogModels[provider] ?? []
  return availableModels(provider, catalogModels, state.catalogStatus[provider])
}

/** Models reachable with an API key. Subscription models are chosen per advisor, not here. */
export function resolveAllModels(): readonly ModelInfo[] {
  const state = useStore.getState()
  const result: ModelInfo[] = []

  for (const provider of Object.keys(state.catalogModels) as Provider[]) {
    if (provider === 'claude-subscription') continue
    const catalog = state.catalogModels[provider] ?? []
    result.push(...availableModels(provider, catalog, state.catalogStatus[provider]))
  }

  return result
}
