import type { Provider, PriceOverride } from '@/types'

interface CatalogPreferences {
  readonly allowedModels: Readonly<Record<string, readonly string[]>>
  readonly priceOverrides: Readonly<Record<string, PriceOverride>>
}

const EMPTY_PREFS: CatalogPreferences = {
  allowedModels: {},
  priceOverrides: {},
}

/**
 * Loads catalog preferences from the persisted JSON file.
 * Returns empty defaults if the file doesn't exist or is invalid.
 */
export async function loadCatalogPreferences(): Promise<CatalogPreferences> {
  const api = getConsiliumAPI()
  if (api == null) return EMPTY_PREFS

  try {
    const raw: unknown = await api.catalogPrefsLoad()
    if (raw == null || typeof raw !== 'object') return EMPTY_PREFS
    return validatePreferences(raw as Record<string, unknown>)
  } catch {
    return EMPTY_PREFS
  }
}

/**
 * Saves catalog preferences to the JSON file.
 */
export async function saveCatalogPreferences(
  allowedModels: Readonly<Record<Provider, readonly string[]>>,
  priceOverrides: Readonly<Record<string, PriceOverride>>,
): Promise<void> {
  const api = getConsiliumAPI()
  if (api == null) return

  const data: CatalogPreferences = { allowedModels, priceOverrides }

  try {
    await api.catalogPrefsSave(data)
  } catch {
    // Non-fatal — preferences stay in memory for this session
  }
}

/**
 * Persists a user-added custom model ID for a provider.
 * Uses the dedicated custom-models IPC channel.
 */
export async function saveCustomModelId(provider: string, modelId: string): Promise<void> {
  const api = (window as { consiliumAPI?: {
    customModelsLoad(): Promise<Readonly<Record<string, readonly string[]>>>
    customModelsSave(models: Readonly<Record<string, readonly string[]>>): Promise<void>
  } }).consiliumAPI
  if (api == null) return

  try {
    const existing = await api.customModelsLoad()
    const providerModels = existing[provider] ?? []
    if (providerModels.includes(modelId)) return

    await api.customModelsSave({
      ...existing,
      [provider]: [...providerModels, modelId],
    })
  } catch { /* non-fatal */ }
}

function getConsiliumAPI(): { catalogPrefsLoad(): Promise<unknown>; catalogPrefsSave(data: unknown): Promise<void> } | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as { consiliumAPI?: { catalogPrefsLoad(): Promise<unknown>; catalogPrefsSave(data: unknown): Promise<void> } }
  return w.consiliumAPI
}

function validatePreferences(raw: Record<string, unknown>): CatalogPreferences {
  const allowedModels: Record<string, readonly string[]> = {}
  const priceOverrides: Record<string, PriceOverride> = {}

  // Validate allowedModels
  const rawAllowed = raw['allowedModels']
  if (rawAllowed != null && typeof rawAllowed === 'object' && !Array.isArray(rawAllowed)) {
    for (const [key, value] of Object.entries(rawAllowed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        allowedModels[key] = value as string[]
      }
    }
  }

  // Validate priceOverrides
  const rawOverrides = raw['priceOverrides']
  if (rawOverrides != null && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)) {
    for (const [key, value] of Object.entries(rawOverrides as Record<string, unknown>)) {
      if (isValidPriceOverride(value)) {
        priceOverrides[key] = value
      }
    }
  }

  return { allowedModels, priceOverrides }
}

function isValidPriceOverride(v: unknown): v is PriceOverride {
  if (v == null || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj['input'] === 'number' && Number.isFinite(obj['input']) &&
    typeof obj['output'] === 'number' && Number.isFinite(obj['output'])
  )
}
