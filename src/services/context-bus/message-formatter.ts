import type { Message } from '@/types'
import type { ApiMessage } from '@/services/api/types'
import { formatWithIdentityHeader } from './identity-headers'

/**
 * Identifies the advisor for whom we are formatting the thread, so we can
 * strip the `[Label]:` prefix from that advisor's own past assistant turns.
 *
 * Why: Sending the model its own past turns prefixed with `[Persona Label]: …`
 * acts as few-shot conditioning — it learns "this is how I respond" and echoes
 * the prefix on every new reply. By giving the model bare text for its own
 * voice while keeping prefixes on everyone else, we break the imitation loop
 * without losing speaker attribution.
 *
 * Match key is `windowId + personaLabel`: after a persona switch on the same
 * window, old messages belong to a *different* occupant and must keep their
 * prefix so the new persona doesn't mistake them for its own words.
 */
export interface SelfContext {
  readonly windowId: string
  readonly personaLabel: string
}

/**
 * Converts store messages to the API message format.
 * Preserves attachments on user messages for multimodal API calls.
 *
 * If `self` is provided, messages authored by that advisor (matched by
 * windowId + personaLabel) are emitted with bare content — no `[Label]:`
 * prefix. All other messages keep their identity header.
 */
export function messagesToApiFormat(
  messages: readonly Message[],
  self?: SelfContext,
): readonly ApiMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m): ApiMessage => {
      const isSelf =
        self != null &&
        m.role === 'assistant' &&
        m.windowId === self.windowId &&
        m.personaLabel === self.personaLabel
      return {
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: isSelf ? m.content : formatWithIdentityHeader(m),
        ...(m.attachments != null && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
      }
    })
}
