import type { QueueCard } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { getRawKey } from '@/features/keys/key-vault'
import { isBudgetExceeded } from '@/features/budget/budget-engine'
import {
  getNextCard,
  getAllParallelCards,
  isCycleComplete,
  completeUserTurn,
} from './turn-engine'

const activeControllers = new Map<string, { controller: AbortController; windowId: string }>()

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
  useStore.setState({ roundsCompleted: 0 })
  state.setIsRunning(true)
  dispatchNextTurn()
}

/**
 * Stops all active agent streams and pauses the queue.
 */
export function stopAll(): void {
  const entries = [...activeControllers.entries()]
  activeControllers.clear()
  const state = useStore.getState()
  for (const [cardId, { controller, windowId }] of entries) {
    controller.abort()
    state.removeActiveCard(cardId)
    state.updateWindow(windowId, { isStreaming: false, streamContent: '' })
  }
  // Prep queue for next start — reset all cards to waiting
  state.setQueue(
    state.queue
      .filter((c) => c.status !== 'errored' && c.status !== 'skipped')
      .map((c) => ({ ...c, status: 'waiting' as const, errorLabel: null })),
  )
  state.setIsRunning(false)
  state.setPaused(false)
  useStore.setState({ roundsCompleted: 0 })
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

function dispatchAgentTurn(card: QueueCard): void {
  const state = useStore.getState()
  const window = state.windows[card.windowId]
  if (window === undefined) {
    state.setCardStatus(card.id, 'errored', 'Window not found')
    onTurnComplete()
    return
  }

  // Validate key and persona before marking card as active
  const key = state.keys.find((k) => k.id === window.keyId)
  if (key === undefined) {
    state.setCardStatus(card.id, 'errored', 'API key not found')
    state.updateWindow(card.windowId, { isStreaming: false, error: 'API key not found' })
    onTurnComplete()
    return
  }

  const apiKey = getRawKey(key.id)
  if (apiKey === null) {
    state.setCardStatus(card.id, 'errored', 'Could not retrieve API key')
    state.updateWindow(card.windowId, { isStreaming: false, error: 'Could not retrieve API key' })
    onTurnComplete()
    return
  }

  const persona = state.personas.find((p) => p.id === window.personaId)
  const personaContent = persona?.content ?? ''
  const systemPrompt = buildSystemPrompt(personaContent, state.sessionInstructions || undefined)
  const threadMessages = messagesToApiFormat(state.messages)

  // Mark card as active and prepare callbacks before setting isStreaming
  state.setCardStatus(card.id, 'active')
  state.addActiveCard(card.id)

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

      // Discard late-arriving responses after user explicitly stopped
      if (controller.signal.aborted) return

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
      current.removeActiveCard(card.id)

      // Use queueMicrotask to avoid unbounded recursive call stack
      queueMicrotask(onTurnComplete)
    },
    onError: (error, tokenUsage) => {
      activeControllers.delete(card.id)

      // Discard late-arriving errors after user explicitly stopped
      if (controller.signal.aborted) return

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
      current.removeActiveCard(card.id)

      // Use queueMicrotask to avoid unbounded recursive call stack
      queueMicrotask(onTurnComplete)
    },
  }

  // Register controller before isStreaming to avoid cancellation gap
  const controller = streamResponse(
    {
      provider: window.provider,
      model: window.model,
      apiKey,
      systemPrompt,
      messages: threadMessages,
      ...(key.baseUrl != null ? { baseUrl: key.baseUrl } : {}),
      ...(key.adapterDefinitionId != null ? { adapterDefinitionId: key.adapterDefinitionId } : {}),
    },
    callbacks,
  )

  activeControllers.set(card.id, { controller, windowId: card.windowId })
  state.updateWindow(card.windowId, { isStreaming: true, streamContent: '', error: null })
}

function onTurnComplete(): void {
  const state = useStore.getState()

  // Budget enforcement: halt after each turn if budget exceeded
  if (state.sessionBudget > 0 && isBudgetExceeded(state.sessionBudget)) {
    stopAll()
    return
  }

  // In parallel mode, wait until ALL active agents have finished before
  // declaring the cycle complete or dispatching the next round.
  if (state.turnMode === 'parallel' && state.activeCardIds.length > 0) {
    return
  }

  if (isCycleComplete(state.queue)) {
    // Cycle complete — check loop counter
    const roundsCompleted = state.roundsCompleted + 1
    const loopCount = state.loopCount

    if (loopCount > 0 && roundsCompleted >= loopCount) {
      // Finite loop exhausted — stop and prep queue for next start
      prepQueueForNextRound()
      return
    }

    // Loop continues (infinite or rounds remaining) — reset queue and dispatch
    useStore.setState({ roundsCompleted })
    resetQueueForNextRound()
    queueMicrotask(() => dispatchNextTurn())
    return
  }

  // Continue dispatching next turns within the current cycle
  dispatchNextTurn()
}

/** Resets all queue cards to 'waiting' for the next round without stopping. */
function resetQueueForNextRound(): void {
  const state = useStore.getState()
  state.setQueue(
    state.queue.map((c) => ({
      ...c,
      status: 'waiting' as const,
      errorLabel: null,
    })),
  )
}

/** Stops running and preps the queue so the user can hit Start again. */
function prepQueueForNextRound(): void {
  const state = useStore.getState()
  state.setQueue(
    state.queue
      .filter((c) => c.status !== 'errored' && c.status !== 'skipped')
      .map((c) => ({ ...c, status: 'waiting' as const, errorLabel: null })),
  )
  state.setIsRunning(false)
  state.setPaused(false)
  useStore.setState({ roundsCompleted: 0 })
}
