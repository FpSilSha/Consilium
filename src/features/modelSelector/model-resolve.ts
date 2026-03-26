import type { ModelInfo, Provider } from '@/types'
import { useStore } from '@/store'
import { getModelById, getModelsForProvider, getAllModels } from './model-registry'

/**
 * Store-aware model lookups.
 * These read openRouterModels from the store at call time and pass them
 * to the pure registry functions. Use these in non-React code that needs
 * to resolve models including dynamic OpenRouter entries.
 */

export function resolveModelById(modelId: string): ModelInfo | undefined {
  const dynamic = useStore.getState().openRouterModels
  return getModelById(modelId, dynamic)
}

export function resolveModelsForProvider(provider: Provider): readonly ModelInfo[] {
  const dynamic = useStore.getState().openRouterModels
  return getModelsForProvider(provider, dynamic)
}

export function resolveAllModels(): readonly ModelInfo[] {
  const dynamic = useStore.getState().openRouterModels
  return getAllModels(dynamic)
}
