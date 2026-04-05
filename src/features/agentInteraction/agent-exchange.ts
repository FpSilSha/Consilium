import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { createAssistantMessage, createUserMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { getRawKey } from '@/features/keys/key-vault'
import { isBudgetExceeded } from '@/features/budget/budget-engine'
import { resolveMentionTargets, cleanMentions } from './mention-router'

const MAX_EXCHANGE_ROUNDS = 10
const activeExchangeControllers = new Map<string, AbortController>()
let lastExchangeDirective: { content: string; targetWindowIds: readonly string[] } | null = null

/**
 * Executes a single-turn agent-to-agent interaction.
 * The user @mentions an agent, triggering that specific agent to respond.
 */
export async function executeAgentExchange(
  userContent: string,
  rounds: number = 1,
): Promise<void> {
  const state = useStore.getState()

  const targetWindowIds = resolveMentionTargets(userContent, state.windows, state.windowOrder)
  if (targetWindowIds.length === 0) return

  const effectiveRounds = Math.min(Math.max(rounds, 1), MAX_EXCHANGE_ROUNDS)
  const cleanedContent = cleanMentions(userContent)

  // Store directive for repeat functionality
  lastExchangeDirective = { content: userContent, targetWindowIds }

  // Append the user's directive as a message
  const userMsg = createUserMessage(cleanedContent, 'user-input')
  state.appendMessage(userMsg)

  for (let round = 0; round < effectiveRounds; round++) {
    // Budget enforcement: cancel exchange if budget exceeded
    const budgetState = useStore.getState()
    if (budgetState.sessionBudget > 0 && isBudgetExceeded(budgetState.sessionBudget)) {
      cancelExchange()
      return
    }

    for (const windowId of targetWindowIds) {
      const aborted = await dispatchSingleExchangeTurn(windowId)
      if (aborted) return
    }
  }
}

/**
 * Repeats the last agent-to-agent exchange.
 */
export async function repeatLastExchange(): Promise<void> {
  if (lastExchangeDirective === null) return
  await executeAgentExchange(lastExchangeDirective.content)
}

/**
 * Cancels all in-flight agent-to-agent exchange streams.
 */
export function cancelExchange(): void {
  const entries = [...activeExchangeControllers.entries()]
  activeExchangeControllers.clear()
  const state = useStore.getState()
  for (const [windowId, controller] of entries) {
    controller.abort()
    state.updateWindow(windowId, { isStreaming: false, streamContent: '' })
  }
}

/**
 * Returns whether there is a last exchange directive available for repeat.
 */
export function hasLastExchange(): boolean {
  return lastExchangeDirective !== null
}

function dispatchSingleExchangeTurn(windowId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const state = useStore.getState()
    const window = state.windows[windowId]
    if (window === undefined) {
      resolve(false)
      return
    }

    const key = state.keys.find((k) => k.id === window.keyId)
    if (key === undefined) {
      state.updateWindow(windowId, { isStreaming: false, error: 'API key not found' })
      resolve(false)
      return
    }

    const apiKey = getRawKey(key.id)
    if (apiKey === null) {
      state.updateWindow(windowId, { isStreaming: false, error: 'Could not retrieve API key' })
      resolve(false)
      return
    }

    const persona = state.personas.find((p) => p.id === window.personaId)
    const systemPrompt = buildSystemPrompt(
      persona?.content ?? '',
      state.sessionInstructions || undefined,
    )

    const messages = messagesToApiFormat(state.messages)

    // Register controller before setting isStreaming to avoid cancellation gap
    const controller = new AbortController()
    activeExchangeControllers.set(windowId, controller)

    state.updateWindow(windowId, { isStreaming: true, streamContent: '', error: null })

    const callbacks: StreamCallbacks = {
      onChunk: (content) => {
        const current = useStore.getState()
        const currentWindow = current.windows[windowId]
        if (currentWindow === undefined) return
        current.updateWindow(windowId, {
          streamContent: currentWindow.streamContent + content,
        })
      },
      onDone: (fullContent, tokenUsage) => {
        activeExchangeControllers.delete(windowId)

        // Discard late-arriving responses after cancellation
        if (controller.signal.aborted) {
          resolve(true)
          return
        }

        const current = useStore.getState()
        const freshWindow = current.windows[windowId]
        const costMeta = buildCostMetadata(tokenUsage, freshWindow?.model ?? window.model)
        const message = createAssistantMessage(
          fullContent,
          freshWindow?.personaLabel ?? window.personaLabel,
          windowId,
          costMeta,
        )

        current.appendMessage(message)
        current.updateWindow(windowId, {
          isStreaming: false,
          streamContent: '',
          runningCost: (freshWindow?.runningCost ?? 0) + (costMeta?.estimatedCost ?? 0),
        })

        resolve(false)
      },
      onError: (error, tokenUsage) => {
        activeExchangeControllers.delete(windowId)

        // Discard late-arriving errors after cancellation
        if (controller.signal.aborted) {
          resolve(true)
          return
        }

        const current = useStore.getState()
        const freshWindow = current.windows[windowId]
        const errorCostMeta = buildCostMetadata(tokenUsage, freshWindow?.model ?? window.model)

        current.updateWindow(windowId, {
          isStreaming: false,
          streamContent: '',
          error,
          runningCost: (freshWindow?.runningCost ?? 0) + (errorCostMeta?.estimatedCost ?? 0),
        })

        resolve(false)
      },
    }

    streamResponse(
      {
        provider: window.provider,
        model: window.model,
        apiKey,
        systemPrompt,
        messages,
        signal: controller.signal,
        ...(key.baseUrl != null ? { baseUrl: key.baseUrl } : {}),
        ...(key.adapterDefinitionId != null ? { adapterDefinitionId: key.adapterDefinitionId } : {}),
      },
      callbacks,
    )
  })
}
