import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { createAssistantMessage, createUserMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { formatWithIdentityHeader } from '@/services/context-bus/identity-headers'
import { getRawKey } from '@/features/keys/key-vault'
import { getModelById } from '@/features/modelSelector/model-registry'
import type { CostMetadata, Message } from '@/types'
import type { TokenUsage, ApiMessage } from '@/services/api/types'
import { isBudgetExceeded } from '@/features/budget/budget-engine'
import { resolveMentionTargets, cleanMentions } from './mention-router'

const MAX_EXCHANGE_ROUNDS = 10
let activeExchangeController: AbortController | null = null
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

  const targetWindowIds = resolveMentionTargets(userContent, state.windows)
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
 * Cancels any in-flight agent-to-agent exchange.
 */
export function cancelExchange(): void {
  if (activeExchangeController !== null) {
    activeExchangeController.abort()
    activeExchangeController = null
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
      state.updateWindow(windowId, { error: 'API key not found' })
      resolve(false)
      return
    }

    const apiKey = getRawKey(key.id)
    if (apiKey === null) {
      state.updateWindow(windowId, { error: 'Could not retrieve API key' })
      resolve(false)
      return
    }

    const persona = state.personas.find((p) => p.id === window.personaId)
    const systemPrompt = buildSystemPrompt(
      persona?.content ?? '',
      state.sessionInstructions || undefined,
    )

    const messages = messagesToApiFormat(state.messages)

    state.updateWindow(windowId, { isStreaming: true, streamContent: '', error: null })

    const controller = new AbortController()
    activeExchangeController = controller

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
        activeExchangeController = null

        const costMeta = buildCostMetadata(tokenUsage, window.model)
        const message = createAssistantMessage(
          fullContent,
          window.personaLabel,
          windowId,
          costMeta,
        )

        const current = useStore.getState()
        current.appendMessage(message)
        current.updateWindow(windowId, {
          isStreaming: false,
          streamContent: '',
          runningCost: window.runningCost + (costMeta?.estimatedCost ?? 0),
        })

        resolve(false)
      },
      onError: (error) => {
        activeExchangeController = null

        const current = useStore.getState()
        current.updateWindow(windowId, {
          isStreaming: false,
          streamContent: '',
          error,
        })

        resolve(controller.signal.aborted)
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
      },
      callbacks,
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

function buildCostMetadata(
  tokenUsage: TokenUsage | undefined,
  modelId: string,
): CostMetadata | undefined {
  if (tokenUsage === undefined) return undefined

  const model = getModelById(modelId)
  const inputCost = tokenUsage.inputTokens * (model?.inputPricePerToken ?? 0)
  const outputCost = tokenUsage.outputTokens * (model?.outputPricePerToken ?? 0)

  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    estimatedCost: inputCost + outputCost,
    isEstimate: model === undefined,
  }
}
