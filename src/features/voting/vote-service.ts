import type { Message } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { createUserMessage, createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { getRawKey } from '@/features/keys/key-vault'
import type { AdvisorVote, VoteTally } from './vote-types'
import { parseVoteResponse, tallyVotes } from './vote-parser'

const VOTE_INSTRUCTION = 'Respond with only: YAY, NAY, or ABSTAIN, followed by a one-sentence justification.'

/** Typed error for re-entrant vote calls — use instanceof checks instead of string matching. */
export class VoteInProgressError extends Error {
  constructor() {
    super('A vote is already in progress')
    this.name = 'VoteInProgressError'
  }
}

/** Prevents concurrent vote calls from corrupting the shared thread. */
let isVoteInFlight = false

/** Active vote stream controllers — aborted when vote is cancelled or session switches. */
const activeVoteControllers = new Set<AbortController>()

/** Aborts all in-flight vote streams. Called during session switching. */
export function cancelActiveVotes(): void {
  for (const controller of activeVoteControllers) {
    controller.abort()
  }
  activeVoteControllers.clear()
  isVoteInFlight = false
}

/**
 * Broadcasts a "Call for Vote" question to all active advisors.
 * Returns a tally of all votes once all advisors have responded.
 *
 * The vote instruction is appended temporarily to the thread so agents see it,
 * then replaced with just the clean question after all votes are collected.
 */
export async function callForVote(question: string): Promise<VoteTally> {
  if (isVoteInFlight) {
    throw new VoteInProgressError()
  }
  isVoteInFlight = true

  try {
    return await executeVote(question)
  } finally {
    isVoteInFlight = false
  }
}

async function executeVote(question: string): Promise<VoteTally> {
  const state = useStore.getState()

  // Append the vote question + instruction as a temporary user message
  const votePrompt = `${question}\n\n${VOTE_INSTRUCTION}`
  const userMsg = createUserMessage(votePrompt, 'user-input')
  state.appendMessage(userMsg)

  // Re-read state after append so agents see the vote question
  const updatedState = useStore.getState()

  // Dispatch to all active windows in parallel
  const windowIds = updatedState.windowOrder
  const votePromises = windowIds.map((windowId) =>
    collectVoteFromWindow(windowId, updatedState.messages),
  )

  const results = await Promise.allSettled(votePromises)
  const votes: AdvisorVote[] = []

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      votes.push(result.value)
    }
  }

  // Replace the temporary vote prompt with the clean question only
  const finalState = useStore.getState()
  const cleanedMessages = finalState.messages.map((m) =>
    m.id === userMsg.id ? { ...m, content: `[Vote] ${question}` } : m,
  )
  finalState.setMessages(cleanedMessages)

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
    let ctrl: AbortController | null = null
    try {
      ctrl = streamResponse(
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
            if (ctrl != null) activeVoteControllers.delete(ctrl)
          },
          onError: (error) => {
            const current = useStore.getState()
            current.updateWindow(windowId, { isStreaming: false, streamContent: '', error })
            resolve(null)
            if (ctrl != null) activeVoteControllers.delete(ctrl)
          },
        },
      )
      activeVoteControllers.add(ctrl)
    } catch {
      state.updateWindow(windowId, { isStreaming: false, streamContent: '' })
      resolve(null)
    }
  })
}
