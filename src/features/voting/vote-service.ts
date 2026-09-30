import type { Message } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { createUserMessage, createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { resolveAdvisorSystemPrompt } from '@/features/systemPrompts/system-prompt-resolver'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { getRawKey } from '@/features/keys/key-vault'
import { resolveAdvisorCredential } from '@/services/api/local-agent/advisor-credential'
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

/** Monotonic generation counter — incremented on each vote, checked before writing results. */
let voteGeneration = 0

/** Active vote stream controllers — aborted when vote is cancelled or session switches. */
const activeVoteControllers = new Set<AbortController>()

/** Aborts all in-flight vote streams. Called during session switching. */
export function cancelActiveVotes(): void {
  for (const controller of activeVoteControllers) {
    controller.abort()
  }
  activeVoteControllers.clear()
  isVoteInFlight = false
  voteGeneration++
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
  const currentGen = ++voteGeneration

  try {
    return await executeVote(question, currentGen)
  } finally {
    // A cancelled vote may finish after a replacement vote has already started.
    if (currentGen === voteGeneration) isVoteInFlight = false
  }
}

async function executeVote(question: string, currentGen: number): Promise<VoteTally> {
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
    collectVoteFromWindow(windowId, updatedState.messages, currentGen),
  )

  const results = await Promise.allSettled(votePromises)
  const votes: AdvisorVote[] = []

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      votes.push(result.value)
    }
  }

  // Replace the temporary vote prompt with the clean question only —
  // skip if the vote was cancelled and a new session loaded
  if (currentGen === voteGeneration) {
    const finalState = useStore.getState()
    const cleanedMessages = finalState.messages.map((m) =>
      m.id === userMsg.id ? { ...m, content: `[Vote] ${question}` } : m,
    )
    finalState.setMessages(cleanedMessages)
  }

  return tallyVotes(votes)
}

async function collectVoteFromWindow(
  windowId: string,
  currentMessages: readonly Message[],
  currentGen: number,
): Promise<AdvisorVote | null> {
  if (currentGen !== voteGeneration) return null
  const state = useStore.getState()
  const window = state.windows[windowId]
  if (window === undefined) return null

  const credential = resolveAdvisorCredential(window, state.keys, getRawKey)
  if (credential.kind === 'missing-key' || credential.kind === 'unreadable-key') return null
  // Votes have always sent only the key (no custom baseUrl); that is unchanged here.
  const apiKey = credential.kind === 'api-key' ? credential.apiKey : ''

  const persona = state.personas.find((p) => p.id === window.personaId)
  const advisorPromptOverride = resolveAdvisorSystemPrompt(state.systemPromptsConfig, state.customSystemPrompts)
  const systemPrompt = buildSystemPrompt(
    persona?.content ?? '',
    state.sessionInstructions || undefined,
    advisorPromptOverride,
  )

  const messages = messagesToApiFormat(currentMessages, {
    windowId,
    personaLabel: window.personaLabel,
  })

  return new Promise((resolve) => {
    const controller = new AbortController()
    let settled = false
    const settle = (vote: AdvisorVote | null): boolean => {
      if (settled) return false
      settled = true
      activeVoteControllers.delete(controller)
      controller.signal.removeEventListener('abort', onAbort)
      resolve(vote)
      return true
    }
    // HTTP may stop silently before headers; completion cannot depend on a callback.
    const onAbort = (): void => { settle(null) }
    controller.signal.addEventListener('abort', onAbort, { once: true })
    activeVoteControllers.add(controller)
    try {
      state.updateWindow(windowId, { isStreaming: true, streamContent: '', error: null })
      if (settled) return
      streamResponse(
        {
          provider: window.provider,
          model: window.model,
          apiKey,
          systemPrompt,
          messages,
          maxTokens: 150,
          signal: controller.signal,
        },
        {
          onChunk: (content) => {
            if (settled) return
            const current = useStore.getState()
            const currentWindow = current.windows[windowId]
            if (currentWindow === undefined) return
            current.updateWindow(windowId, {
              streamContent: currentWindow.streamContent + content,
            })
          },
          onDone: (fullContent) => {
            if (settled) return
            const vote = parseVoteResponse(
              fullContent,
              windowId,
              window.personaLabel,
              window.accentColor,
            )
            settle(vote)
            const msg = createAssistantMessage(fullContent, window.personaLabel, windowId)
            const current = useStore.getState()
            current.appendMessage(msg)
            current.updateWindow(windowId, { isStreaming: false, streamContent: '' })
          },
          onStale: () => {
            // The conversation changed; count as no vote without touching the new session.
            settle(null)
          },
          onError: (error) => {
            if (!settle(null)) return
            const current = useStore.getState()
            current.updateWindow(windowId, { isStreaming: false, streamContent: '', error })
          },
        },
      )
    } catch {
      if (!settle(null)) return
      state.updateWindow(windowId, { isStreaming: false, streamContent: '' })
    }
  })
}
