import type { ModelInfo } from '@/types'
import { useStore } from '@/store'
import { refreshProviderCatalog } from '@/services/api/catalog/fetch-all-catalogs'

/** Compatibility entry points; all fetching now goes through the catalog service. */
export async function fetchOpenRouterCatalogPublic(): Promise<readonly ModelInfo[]> {
  const state = useStore.getState()
  if (state.catalogStatus.openrouter === 'loaded') return state.catalogModels.openrouter
  const result = await refreshProviderCatalog('openrouter')
  return result.error == null ? result.models : useStore.getState().catalogModels.openrouter
}

export function fetchOpenRouterModels(_apiKey: string): Promise<readonly ModelInfo[]> {
  return fetchOpenRouterCatalogPublic()
}
