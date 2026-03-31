import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { getModelsForProvider } from '@/features/modelSelector/model-registry'

/**
 * Returns the list of models available for a provider, filtered by
 * the user's allowed models selection.
 *
 * - If allowedModels is empty for the provider, all models are returned.
 * - Falls back to static registry when the catalog is empty.
 */
export function useFilteredModels(provider: Provider): readonly ModelInfo[] {
  const catalogModels = useStore((s) => s.catalogModels[provider]) ?? []
  const allowedIds = useStore((s) => s.allowedModels[provider]) ?? []
  // Use catalog if available, else static fallback
  const allModels = catalogModels.length > 0
    ? catalogModels
    : getModelsForProvider(provider)

  // Empty allowed list = all models permitted
  if (allowedIds.length === 0) return allModels

  return allModels.filter((m) => allowedIds.includes(m.id))
}
