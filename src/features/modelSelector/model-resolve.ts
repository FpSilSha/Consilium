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
  for (const provider of Object.keys(state.catalogModels)) {
    const models = state.catalogModels[provider as Provider] ?? []
    const match = models.find((m) => m.id === modelId)
    if (match != null) return match
  }

  // Fall back to static registry + legacy OpenRouter store
  const dynamic = state.openRouterModels
  return getModelById(modelId, dynamic)
}

export function resolveModelsForProvider(provider: Provider): readonly ModelInfo[] {
  const state = useStore.getState()
  const catalogModels = state.catalogModels[provider] ?? []
  if (catalogModels.length > 0) return catalogModels

  // Fall back to static + legacy OpenRouter
  const dynamic = state.openRouterModels
  return getModelsForProvider(provider, dynamic)
}

export function resolveAllModels(): readonly ModelInfo[] {
  const state = useStore.getState()
  const dynamic = state.openRouterModels
  const result: ModelInfo[] = []

  // Per-provider: use catalog if available, else fall back to static
  for (const provider of Object.keys(state.catalogModels) as Provider[]) {
    const catalog = state.catalogModels[provider] ?? []
    if (catalog.length > 0) {
      result.push(...catalog)
    } else {
      result.push(...getModelsForProvider(provider, dynamic))
    }
  }

  return result.length > 0 ? result : getAllModels(dynamic)
}
