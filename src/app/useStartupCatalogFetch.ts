import { useEffect } from 'react'
import { useStore } from '@/store'
import { fetchAllCatalogs } from '@/services/api/catalog/fetch-all-catalogs'
import { loadCatalogPreferences } from '@/features/modelCatalog/catalog-persistence'
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
      })
      .catch(() => {})
      .finally(() => {
        if (controller.signal.aborted) return
        fetchAllCatalogs(controller.signal).catch(() => {})
      })

    return () => { controller.abort() }
  }, [keysLoaded])
}
