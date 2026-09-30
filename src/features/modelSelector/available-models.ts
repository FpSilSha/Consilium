import type { CatalogStatus, ModelInfo, Provider } from '@/types'
import { getModelsForProvider } from './model-registry'
import { CLAUDE_SUBSCRIPTION_MODELS } from '@/services/api/local-agent/claude-models'

/** A successful empty catalog means no supported models, not a network failure. */
export function availableModels(provider: Provider, catalog: readonly ModelInfo[], status: CatalogStatus): readonly ModelInfo[] {
  // Subscription advisors have no catalog endpoint; the runtime decides availability.
  if (provider === 'claude-subscription') return CLAUDE_SUBSCRIPTION_MODELS
  if (status === 'loaded' || catalog.length > 0) return catalog
  return getModelsForProvider(provider)
}
