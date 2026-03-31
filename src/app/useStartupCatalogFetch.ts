import { useEffect } from 'react'
import { useStore } from '@/store'
import { fetchAllCatalogs } from '@/services/api/catalog/fetch-all-catalogs'

/** Module-scope guard — ensures exactly one fetch per app process */
let hasStartupFetchRun = false

/**
 * Triggers a background catalog fetch once keys have loaded.
 * Fire-and-forget — the UI works immediately with static fallback
 * and updates reactively when catalog data arrives.
 */
export function useStartupCatalogFetch(): void {
  const keysLoaded = useStore((s) => s.keysLoaded)

  useEffect(() => {
    if (!keysLoaded || hasStartupFetchRun) return
    hasStartupFetchRun = true

    const controller = new AbortController()
    fetchAllCatalogs(controller.signal).catch(() => {
      // Non-fatal — static registry is the fallback
    })

    return () => { controller.abort() }
  }, [keysLoaded])
}
