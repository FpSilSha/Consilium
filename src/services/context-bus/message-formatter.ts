import type { Message } from '@/types'
import type { ApiMessage } from '@/services/api/types'
import { formatWithIdentityHeader } from './identity-headers'

/**
 * Converts store messages to the API message format.
 * Shared utility used by turn-dispatcher, agent-exchange, and vote-service.
 */
export function messagesToApiFormat(messages: readonly Message[]): readonly ApiMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: formatWithIdentityHeader(m),
    }))
}
