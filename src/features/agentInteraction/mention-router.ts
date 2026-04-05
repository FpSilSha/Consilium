import type { AdvisorWindow } from '@/types'
import { extractMentions, stripMentions } from '@/services/context-bus/identity-headers'
import { computeDisplayLabels } from '@/features/windows/display-labels'

/**
 * Parses a user message for @mention directives and resolves target windows.
 * Uses display labels (with numeric suffixes for duplicates) for matching.
 */
export function resolveMentionTargets(
  content: string,
  windows: Readonly<Record<string, AdvisorWindow>>,
  windowOrder?: readonly string[],
): readonly string[] {
  const mentions = extractMentions(content)
  if (mentions.length === 0) return []

  // Build display label lookup if window order is available
  const order = windowOrder ?? Object.keys(windows)
  const displayLabels = computeDisplayLabels(order, windows)

  // Build a lookup: normalized display label → window ID
  const labelToId = new Map<string, string>()
  for (const [id, label] of displayLabels) {
    labelToId.set(label.toLowerCase().replace(/\s+/g, ''), id)
    labelToId.set(label.toLowerCase(), id)
  }

  // Also add raw persona labels (without numbers) for single-instance personas
  for (const [id, w] of Object.entries(windows)) {
    const normalized = w.personaLabel.toLowerCase().replace(/\s+/g, '')
    // Only set if not already taken by a numbered label (avoids ambiguity)
    if (!labelToId.has(normalized)) {
      labelToId.set(normalized, id)
    }
    if (!labelToId.has(w.personaLabel.toLowerCase())) {
      labelToId.set(w.personaLabel.toLowerCase(), id)
    }
  }

  return mentions
    .map((mention) => {
      const normalized = mention.toLowerCase().replace(/\s+/g, '')

      // Exact match on display label (including numbered ones like "securityengineer2")
      const exact = labelToId.get(normalized)
      if (exact != null) return exact

      // Partial match — find first display label that contains the mention
      for (const [label, id] of labelToId) {
        if (label.includes(normalized) || normalized.includes(label)) {
          return id
        }
      }

      return undefined
    })
    .filter((id): id is string => id !== undefined)
}

/**
 * Strips @mentions from content for clean message delivery.
 */
export function cleanMentions(content: string): string {
  return stripMentions(content)
}

/**
 * Checks if a message contains @mention directives.
 */
export function hasMentions(content: string): boolean {
  return extractMentions(content).length > 0
}
