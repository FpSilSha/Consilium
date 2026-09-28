import type { CatalogStatus, ModelInfo, Provider } from '@/types'
import { getModelsForProvider } from './model-registry'

/** A successful empty catalog means no supported models, not a network failure. */
export function availableModels(provider: Provider, catalog: readonly ModelInfo[], status: CatalogStatus): readonly ModelInfo[] {
  if (status === 'loaded' || catalog.length > 0) return catalog
  return getModelsForProvider(provider)
}
