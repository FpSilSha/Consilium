import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { fetchAllCatalogs } from '@/services/api/catalog/fetch-all-catalogs'
import { loadCatalogPreferences } from '@/features/modelCatalog/catalog-persistence'
import type { Provider } from '@/types'

/** Restartable under StrictMode; adding a key refreshes catalogs without reloading preferences. */
export function useStartupCatalogFetch(): void {
  const keysLoaded = useStore((state) => state.keysLoaded)
  const keySignature = useStore((state) => state.keys.map((key) => key.provider + ':' + key.id).sort().join('|'))
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  useEffect(() => {
    if (!keysLoaded) return
    const controller = new AbortController()
    void loadSettings(controller.signal).finally(() => {
      if (!controller.signal.aborted) setPreferencesLoaded(true)
    })
    return () => controller.abort()
  }, [keysLoaded])

  useEffect(() => {
    if (!keysLoaded || !preferencesLoaded) return
    const controller = new AbortController()
    void fetchAllCatalogs(controller.signal).catch(() => {})
    return () => controller.abort()
  }, [keysLoaded, preferencesLoaded, keySignature])
}

async function loadSettings(signal: AbortSignal): Promise<void> {
  try {
    const prefs = await loadCatalogPreferences()
    if (signal.aborted) return
    const state = useStore.getState()
    for (const [provider, modelIds] of Object.entries(prefs.allowedModels)) {
      if (provider in state.catalogModels) state.setAllowedModels(provider as Provider, modelIds)
    }
    for (const [id, override] of Object.entries(prefs.priceOverrides)) state.setPriceOverride(id, override)
    // Load custom IDs before discovery so refresh can preserve them deterministically.
    const custom = await window.consiliumAPI?.customModelsLoad()
    if (signal.aborted) return
    for (const [provider, ids] of Object.entries(custom ?? {})) {
      if (!(provider in state.catalogModels) || !Array.isArray(ids)) continue
      const current = useStore.getState()
      const typedProvider = provider as Provider
      const models = current.catalogModels[typedProvider]
      const knownIds = new Set(models.map((model) => model.id))
      const extraIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim() !== '' && !knownIds.has(id)))]
      current.setCatalogModels(typedProvider, [
        ...models.map((model) => ids.includes(model.id) ? { ...model, isCustom: true } : model),
        ...extraIds.map((id) => ({
          id, name: id, provider: typedProvider, contextWindow: 0,
          inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false, isCustom: true,
        })),
      ])
    }
  } catch { /* Failed preferences must not prevent live model discovery. */ }
}
