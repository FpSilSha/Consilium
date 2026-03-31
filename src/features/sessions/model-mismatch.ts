import type { AdvisorWindow, Provider } from '@/types'

export interface ModelMismatch {
  readonly windowId: string
  readonly personaLabel: string
  readonly currentModel: string
  readonly provider: Provider
}

/**
 * Detects advisors whose models are not in the allowed list.
 * Skips check if the allowed list for a provider is empty (all allowed).
 */
export function detectModelMismatches(
  windows: Readonly<Record<string, AdvisorWindow>>,
  allowedModels: Readonly<Record<Provider, readonly string[]>>,
): readonly ModelMismatch[] {
  const mismatches: ModelMismatch[] = []

  for (const win of Object.values(windows)) {
    const allowed = allowedModels[win.provider] ?? []
    // Empty = all allowed, skip check
    if (allowed.length === 0) continue

    if (!allowed.includes(win.model)) {
      mismatches.push({
        windowId: win.id,
        personaLabel: win.personaLabel,
        currentModel: win.model,
        provider: win.provider,
      })
    }
  }

  return mismatches
}
