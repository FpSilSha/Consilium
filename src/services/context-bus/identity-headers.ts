import type { Message } from '@/types'

/**
 * Formats a message with its identity header for the shared context.
 * Example: "[Security Engineer]: We should use AES-256."
 */
export function formatWithIdentityHeader(message: Message): string {
  const label = message.role === 'user' ? 'You' : message.personaLabel
  return `[${label}]: ${message.content}`
}

/**
 * Formats the full shared thread with identity headers for sending to an agent.
 */
export function formatThreadForAgent(messages: readonly Message[]): string {
  return messages.map(formatWithIdentityHeader).join('\n\n')
}

/**
 * Strips @mention syntax from message content before sending to any model.
 * Example: "@SecurityAdvisor what do you think?" → "what do you think?"
 */
export function stripMentions(content: string): string {
  return content.replace(/@\w[\w-]*/g, '').replace(/\s{2,}/g, ' ').trim()
}

/**
 * Extracts @mention targets from message content.
 * Returns an array of mentioned persona labels.
 */
export function extractMentions(content: string): readonly string[] {
  const matches = content.match(/@(\w[\w-]*)/g)
  if (matches === null) return []
  return matches.map((m) => m.slice(1))
}
