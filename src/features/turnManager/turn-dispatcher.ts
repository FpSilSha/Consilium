import type { QueueCard, CostMetadata, Message } from '@/types'
import type { TokenUsage, ApiMessage } from '@/services/api/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { formatWithIdentityHeader } from '@/services/context-bus/identity-headers'
import { getRawKey } from '@/features/keys/key-vault'
import { getModelById } from '@/features/modelSelector/model-registry'
import { isBudgetExceeded } from '@/features/budget/budget-engine'
import {
  getNextCard,
  getAllParallelCards,
  isCycleComplete,
  completeUserTurn,
} from './turn-engine'

const activeControllers = new Map<string, AbortController>()

/**
 * Dispatches the next turn(s) based on the current queue state and turn mode.
 * Called after a user message or after an agent completes.
 */
export function dispatchNextTurn(): void {
  const state = useStore.getState()
  const { turnMode, queue, isPaused } = state

  if (isPaused || !state.isRunning) return

  // Budget enforcement: halt all dispatch when budget exceeded
  if (state.sessionBudget > 0 && isBudgetExceeded(state.sessionBudget)) {
    stopAll()
    return
  }

  if (turnMode === 'parallel') {
    const cards = getAllParallelCards(queue)
    for (const card of cards) {
      dispatchAgentTurn(card)
    }
    return
  }

  const next = getNextCard(queue, turnMode, isPaused)
  if (next !== null) {
    dispatchAgentTurn(next)
  }
}

/**
 * Called when the user submits a message during sequential/queue modes.
 * Marks the user card as completed and triggers the next agent.
 */
export function handleUserMessage(): void {
  const state = useStore.getState()
  const updatedQueue = completeUserTurn(state.queue)
  state.setQueue(updatedQueue)
  dispatchNextTurn()
}

/**
 * Starts a run cycle. In sequential/queue mode, starts from the first card.
 * In parallel mode, dispatches all agents at once.
 */
export function startRun(): void {
  const state = useStore.getState()
  state.setIsRunning(true)
  dispatchNextTurn()
}

/**
 * Stops all active agent streams and pauses the queue.
 */
export function stopAll(): void {
  for (const [cardId, controller] of activeControllers) {
    controller.abort()
    activeControllers.delete(cardId)
  }
  const state = useStore.getState()
  state.setPaused(true)
  state.setIsRunning(false)
}

/**
 * Manually triggers a specific agent in manual mode.
 */
export function manualDispatch(cardId: string): void {
  const state = useStore.getState()
  if (state.turnMode !== 'manual') return

  const card = state.queue.find((c) => c.id === cardId)
  if (card === undefined || card.isUser || card.status !== 'waiting') return

  state.setIsRunning(true)
  dispatchAgentTurn(card)
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

function messagesToApiFormat(messages: readonly Message[]): readonly ApiMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: formatWithIdentityHeader(m),
    }))
}

function dispatchAgentTurn(card: QueueCard): void {
  const state = useStore.getState()
  const window = state.windows[card.windowId]
  if (window === undefined) {
    state.setCardStatus(card.id, 'errored', 'Window not found')
    onTurnComplete()
    return
  }

  // Mark card and window as active
  state.setCardStatus(card.id, 'active')
  state.setActiveCard(card.id)
  state.updateWindow(card.windowId, { isStreaming: true, streamContent: '', error: null })

  // Find the API key for this window
  const key = state.keys.find((k) => k.id === window.keyId)
  if (key === undefined) {
    state.setCardStatus(card.id, 'errored', 'API key not found')
    state.updateWindow(card.windowId, { isStreaming: false, error: 'API key not found' })
    onTurnComplete()
    return
  }

  // Find persona content
  const persona = state.personas.find((p) => p.id === window.personaId)
  const personaContent = persona?.content ?? ''

  // Build system prompt and convert messages to API format
  const systemPrompt = buildSystemPrompt(personaContent, state.sessionInstructions || undefined)
  const threadMessages = messagesToApiFormat(state.messages)

  const apiKey = getRawKey(key.id)
  if (apiKey === null) {
    state.setCardStatus(card.id, 'errored', 'Could not retrieve API key')
    state.updateWindow(card.windowId, { isStreaming: false, error: 'Could not retrieve API key' })
    onTurnComplete()
    return
  }

  const callbacks: StreamCallbacks = {
    onChunk: (content) => {
      const current = useStore.getState()
      const currentWindow = current.windows[card.windowId]
      if (currentWindow === undefined) return
      current.updateWindow(card.windowId, {
        streamContent: currentWindow.streamContent + content,
      })
    },
    onDone: (fullContent, tokenUsage) => {
      activeControllers.delete(card.id)

      // Read fresh window state to avoid stale closure in parallel mode
      const current = useStore.getState()
      const freshWindow = current.windows[card.windowId]
      const costMeta = buildCostMetadata(tokenUsage, freshWindow?.model ?? window.model)

      const message = createAssistantMessage(
        fullContent,
        freshWindow?.personaLabel ?? window.personaLabel,
        card.windowId,
        costMeta,
      )

      current.appendMessage(message)
      current.updateWindow(card.windowId, {
        isStreaming: false,
        streamContent: '',
        runningCost: (freshWindow?.runningCost ?? 0) + (costMeta?.estimatedCost ?? 0),
      })
      current.setCardStatus(card.id, 'completed')
      current.setActiveCard(null)

      // Use queueMicrotask to avoid unbounded recursive call stack
      queueMicrotask(onTurnComplete)
    },
    onError: (error, tokenUsage) => {
      activeControllers.delete(card.id)

      // Read fresh window state to avoid stale closure in parallel mode
      const current = useStore.getState()
      const freshWindow = current.windows[card.windowId]
      const costMeta = buildCostMetadata(tokenUsage, freshWindow?.model ?? window.model)

      current.updateWindow(card.windowId, {
        isStreaming: false,
        streamContent: '',
        error,
        runningCost: (freshWindow?.runningCost ?? 0) + (costMeta?.estimatedCost ?? 0),
      })
      current.setCardStatus(card.id, 'errored', error)
      current.setActiveCard(null)

      // Use queueMicrotask to avoid unbounded recursive call stack
      queueMicrotask(onTurnComplete)
    },
  }

  const controller = streamResponse(
    {
      provider: window.provider,
      model: window.model,
      apiKey,
      systemPrompt,
      messages: threadMessages,
    },
    callbacks,
  )

  activeControllers.set(card.id, controller)
}

function onTurnComplete(): void {
  const state = useStore.getState()

  // Budget enforcement: halt after each turn if budget exceeded
  if (state.sessionBudget > 0 && isBudgetExceeded(state.sessionBudget)) {
    stopAll()
    return
  }

  if (isCycleComplete(state.queue)) {
    state.setIsRunning(false)
    return
  }

  // Continue dispatching next turns
  dispatchNextTurn()
}
