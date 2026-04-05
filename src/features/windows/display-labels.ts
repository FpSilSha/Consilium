import type { AdvisorWindow } from '@/types'

/**
 * Computes display labels with numeric suffixes for duplicate personas.
 *
 * Rules:
 * - If only one advisor has a given persona name, no suffix: "Security Engineer"
 * - If multiple share a name, each gets a sequential number: "Security Engineer 1", "Security Engineer 2"
 * - Numbers are assigned by window order position (panel order)
 * - Deleting an advisor causes renumbering (not persisted — purely derived)
 *
 * Returns a Map of windowId → displayLabel.
 */
export function computeDisplayLabels(
  windowOrder: readonly string[],
  windows: Readonly<Record<string, AdvisorWindow>>,
): ReadonlyMap<string, string> {
  // Count how many times each persona label appears
  const labelCounts = new Map<string, number>()
  for (const id of windowOrder) {
    const w = windows[id]
    if (w == null) continue
    labelCounts.set(w.personaLabel, (labelCounts.get(w.personaLabel) ?? 0) + 1)
  }

  // Assign numbered labels only for duplicates
  const labelCounters = new Map<string, number>()
  const result = new Map<string, string>()

  for (const id of windowOrder) {
    const w = windows[id]
    if (w == null) continue

    const count = labelCounts.get(w.personaLabel) ?? 1
    if (count === 1) {
      result.set(id, w.personaLabel)
    } else {
      const index = (labelCounters.get(w.personaLabel) ?? 0) + 1
      labelCounters.set(w.personaLabel, index)
      result.set(id, `${w.personaLabel} ${index}`)
    }
  }

  return result
}

/**
 * Gets a single display label for a window ID.
 * Convenience wrapper around computeDisplayLabels.
 */
export function getDisplayLabel(
  windowId: string,
  windowOrder: readonly string[],
  windows: Readonly<Record<string, AdvisorWindow>>,
): string {
  return computeDisplayLabels(windowOrder, windows).get(windowId)
    ?? windows[windowId]?.personaLabel
    ?? 'Unknown'
}
