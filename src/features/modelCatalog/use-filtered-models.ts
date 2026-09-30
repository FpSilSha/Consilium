import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { availableModels } from '@/features/modelSelector/available-models'

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
  const status = useStore((s) => s.catalogStatus[provider])
  const allModels = availableModels(provider, catalogModels, status)

  // Empty allowed list = all models permitted
  if (allowedIds.length === 0) return allModels

  return allModels.filter((m) => allowedIds.includes(m.id))
}
