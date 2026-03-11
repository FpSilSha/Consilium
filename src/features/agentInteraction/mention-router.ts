import type { AdvisorWindow } from '@/types'
import { extractMentions, stripMentions } from '@/services/context-bus/identity-headers'

/**
 * Parses a user message for @mention directives and resolves target windows.
 */
export function resolveMentionTargets(
  content: string,
  windows: Readonly<Record<string, AdvisorWindow>>,
): readonly string[] {
  const mentions = extractMentions(content)
  if (mentions.length === 0) return []

  const windowList = Object.values(windows)

  return mentions
    .map((mention) => {
      // Match by persona label (case-insensitive, supports partial match)
      const normalized = mention.toLowerCase()
      const match = windowList.find((w) =>
        w.personaLabel.toLowerCase().replace(/\s+/g, '').includes(normalized) ||
        w.personaLabel.toLowerCase().includes(normalized),
      )
      return match?.id
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
