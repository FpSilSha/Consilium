import type { ModelInfo, Provider } from '@/types'
import { useStore } from '@/store'
import { getModelById, getModelsForProvider, getAllModels } from './model-registry'

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
  if (catalogModels.length > 0) return catalogModels
  return getModelsForProvider(provider)
}

export function resolveAllModels(): readonly ModelInfo[] {
  const state = useStore.getState()
  const result: ModelInfo[] = []

  for (const provider of Object.keys(state.catalogModels) as Provider[]) {
    const catalog = state.catalogModels[provider] ?? []
    if (catalog.length > 0) {
      result.push(...catalog)
    } else {
      result.push(...getModelsForProvider(provider))
    }
  }

  return result.length > 0 ? result : getAllModels()
}
