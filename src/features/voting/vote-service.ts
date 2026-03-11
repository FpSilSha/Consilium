import type { AdvisorWindow, Message } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { createUserMessage, createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { formatWithIdentityHeader } from '@/services/context-bus/identity-headers'
import { getRawKey } from '@/features/keys/key-vault'
import type { AdvisorVote, VoteTally } from './vote-types'
import { parseVoteResponse, tallyVotes } from './vote-parser'
import type { ApiMessage } from '@/services/api/types'

const VOTE_INSTRUCTION = 'Respond with only: YAY, NAY, or ABSTAIN, followed by a one-sentence justification.'

/**
 * Broadcasts a "Call for Vote" question to all active advisors.
 * Returns a tally of all votes once all advisors have responded.
 */
export async function callForVote(question: string): Promise<VoteTally> {
  const state = useStore.getState()

  // Append the vote question as a user message
  const votePrompt = `${question}\n\n${VOTE_INSTRUCTION}`
  const userMsg = createUserMessage(votePrompt, 'user-input')
  state.appendMessage(userMsg)

  // Dispatch to all active windows in parallel
  const windowIds = state.windowOrder
  const votePromises = windowIds.map((windowId) =>
    collectVoteFromWindow(windowId, state.messages),
  )

  const results = await Promise.allSettled(votePromises)
  const votes: AdvisorVote[] = []

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      votes.push(result.value)
    }
  }

  return tallyVotes(votes)
}

async function collectVoteFromWindow(
  windowId: string,
  currentMessages: readonly Message[],
): Promise<AdvisorVote | null> {
  const state = useStore.getState()
  const window = state.windows[windowId]
  if (window === undefined) return null

  const key = state.keys.find((k) => k.id === window.keyId)
  if (key === undefined) return null

  const apiKey = getRawKey(key.id)
  if (apiKey === null) return null

  const persona = state.personas.find((p) => p.id === window.personaId)
  const systemPrompt = buildSystemPrompt(
    persona?.content ?? '',
    state.sessionInstructions || undefined,
  )

  const messages = messagesToApiFormat(currentMessages)

  state.updateWindow(windowId, { isStreaming: true, streamContent: '', error: null })

  return new Promise((resolve) => {
    streamResponse(
      {
        provider: window.provider,
        model: window.model,
        apiKey,
        systemPrompt,
        messages,
        maxTokens: 150,
      },
      {
        onChunk: (content) => {
          const current = useStore.getState()
          const currentWindow = current.windows[windowId]
          if (currentWindow === undefined) return
          current.updateWindow(windowId, {
            streamContent: currentWindow.streamContent + content,
          })
        },
        onDone: (fullContent) => {
          const msg = createAssistantMessage(fullContent, window.personaLabel, windowId)
          const current = useStore.getState()
          current.appendMessage(msg)
          current.updateWindow(windowId, { isStreaming: false, streamContent: '' })

          const vote = parseVoteResponse(
            fullContent,
            windowId,
            window.personaLabel,
            window.accentColor,
          )
          resolve(vote)
        },
        onError: (error) => {
          const current = useStore.getState()
          current.updateWindow(windowId, { isStreaming: false, streamContent: '', error })
          resolve(null)
        },
      },
    )
  })
}

function messagesToApiFormat(messages: readonly Message[]): readonly ApiMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: formatWithIdentityHeader(m),
    }))
}
