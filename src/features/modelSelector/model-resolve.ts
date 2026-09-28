import type { ModelInfo, Provider } from '@/types'
import { useStore } from '@/store'
import { getModelById } from './model-registry'
import { availableModels } from './available-models'

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

  // Fall back to static registry
  return getModelById(modelId)
}

export function resolveModelsForProvider(provider: Provider): readonly ModelInfo[] {
  const state = useStore.getState()
  const catalogModels = state.catalogModels[provider] ?? []
  return availableModels(provider, catalogModels, state.catalogStatus[provider])
}

export function resolveAllModels(): readonly ModelInfo[] {
  const state = useStore.getState()
  const result: ModelInfo[] = []

  for (const provider of Object.keys(state.catalogModels) as Provider[]) {
    const catalog = state.catalogModels[provider] ?? []
    result.push(...availableModels(provider, catalog, state.catalogStatus[provider]))
  }

  return result
}
