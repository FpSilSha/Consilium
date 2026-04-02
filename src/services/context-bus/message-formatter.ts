import type { Message } from '@/types'
import type { ApiMessage } from '@/services/api/types'
import { formatWithIdentityHeader } from './identity-headers'

/**
 * Converts store messages to the API message format.
 * Preserves attachments on user messages for multimodal API calls.
 */
export function messagesToApiFormat(messages: readonly Message[]): readonly ApiMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m): ApiMessage => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: formatWithIdentityHeader(m),
      ...(m.attachments != null && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
    }))
}
