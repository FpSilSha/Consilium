import { useEffect } from 'react'
import { useStore } from '@/store'
import { fetchAllCatalogs } from '@/services/api/catalog/fetch-all-catalogs'
import { loadCatalogPreferences } from '@/features/modelCatalog/catalog-persistence'
import { fetchOpenRouterCatalogPublic } from '@/features/modelSelector/openrouter-models'
import type { Provider } from '@/types'

/** Module-scope guard — ensures exactly one fetch per app process */
let hasStartupFetchRun = false

/**
 * Triggers a background catalog fetch once keys have loaded.
 * Also loads persisted catalog preferences (allowed models, price overrides).
 * Fire-and-forget — the UI works immediately with static fallback
 * and updates reactively when catalog data arrives.
 */
export function useStartupCatalogFetch(): void {
  const keysLoaded = useStore((s) => s.keysLoaded)

  useEffect(() => {
    if (!keysLoaded || hasStartupFetchRun) return
    hasStartupFetchRun = true

    const controller = new AbortController()

    // Fetch OpenRouter catalog immediately (no key needed) so pricing is available early
    fetchOpenRouterCatalogPublic().catch(() => {})

    // Load persisted preferences first, then fetch catalogs
    loadCatalogPreferences()
      .then((prefs) => {
        if (controller.signal.aborted) return
        const { setAllowedModels, setPriceOverride } = useStore.getState()

        for (const [provider, modelIds] of Object.entries(prefs.allowedModels)) {
          if (Array.isArray(modelIds) && modelIds.length > 0) {
            setAllowedModels(provider as Provider, modelIds)
          }
        }

        for (const [modelId, override] of Object.entries(prefs.priceOverrides)) {
          setPriceOverride(modelId, override)
        }

        // Load persisted custom model IDs from dedicated file
        const customModelsApi = (window as { consiliumAPI?: { customModelsLoad(): Promise<Readonly<Record<string, readonly string[]>>> } }).consiliumAPI
        if (customModelsApi != null) {
          customModelsApi.customModelsLoad().then((customModels) => {
            if (controller.signal.aborted) return
            const { setCatalogModels, catalogModels } = useStore.getState()
            for (const [provider, modelIds] of Object.entries(customModels)) {
              if (!Array.isArray(modelIds) || modelIds.length === 0) continue
              const existing = catalogModels[provider as Provider] ?? []
              const existingIds = new Set(existing.map((m) => m.id))
              const newModels = modelIds
                .filter((id) => !existingIds.has(id))
                .map((id) => ({
                  id,
                  name: id,
                  provider: provider as Provider,
                  contextWindow: 0,
                  inputPricePerToken: 0,
                  outputPricePerToken: 0,
                }))
              if (newModels.length > 0) {
                setCatalogModels(provider as Provider, [...existing, ...newModels])
              }
            }
          }).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => {
        if (controller.signal.aborted) return
        fetchAllCatalogs(controller.signal).catch(() => {})
      })

    return () => { controller.abort() }
  }, [keysLoaded])
}
