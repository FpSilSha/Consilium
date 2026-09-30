import type { AdvisorWindow, QueueCard } from '@/types'
import { useStore } from '@/store'
import { streamResponse, isTransientError } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { resolveAdvisorSystemPrompt } from '@/features/systemPrompts/system-prompt-resolver'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { resolveAdvisorCredential, credentialRequestFields } from '@/services/api/local-agent/advisor-credential'
import { getRawKey } from '@/features/keys/key-vault'
import { isBudgetExceeded } from '@/features/budget/budget-engine'
import { computeDisplayLabels } from '@/features/windows/display-labels'
import { checkAutoCompaction } from '@/features/compaction'
import { abortActiveCompile } from '@/features/documents/compile-controller'
import {
  getNextCard,
  getAllParallelCards,
  isCycleComplete,
  completeUserTurn,
} from './turn-engine'
import { createRetryCard, dropOrphanUserTurns, ensureUserTurnForSoloAgent, hasActiveAgent, isSoloSequentialQueue, prepareQueueForRun, queueForRetryFromStop, queueForRetryWhileRunning } from './queue-builder'

// `provider` and `model` are what the request was sent with; billing must use them even if the advisor is edited mid-stream.
const activeControllers = new Map<string, { controller: AbortController; windowId: string; provider: string; model: string }>()

/** Tracks cards that have been auto-retried this run cycle (max 1 retry per card). */
const retriedCards = new Set<string>()

/**
 * Solo Seq only: a user message sent while no user turn was open (the lone
 * advisor was still replying, so its reply can't have seen the message). It
 * counts as the user's turn in the next round, so the message is answered
 * instead of the queue waiting for another one. With several advisors a later
 * advisor in the same round already sees the message, so this isn't used.
 */
let userMessageAwaitingTurn = false

/** Retry cards: each runs once, then is removed from the queue (see retryAdvisor). */
const oneShotCards = new Set<string>()

/**
 * Whether any advisor turn in the current round replied (sent text or
 * finished). A round in which none did (missing keys, requests refused before
 * reaching the network, every request failing) must not start the next round
 * on its own (see onTurnComplete).
 */
let advisorRepliedThisRound = false

/** Every retry card created in this app session (see dropLeftoverRetryCards). */
const liveRetryCards = new Set<string>()
const isLiveRetryCard = (cardId: string): boolean => liveRetryCards.has(cardId)

/**
 * Pending transient-error auto-retries by card id (see onError). Cancelled when
 * a run stops, ends or starts, and when the card is dispatched another way.
 */
const autoRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()

function cancelAutoRetries(): void {
  for (const timer of autoRetryTimers.values()) clearTimeout(timer)
  autoRetryTimers.clear()
}

function cancelAutoRetry(cardId: string): void {
  const timer = autoRetryTimers.get(cardId)
  if (timer === undefined) return
  clearTimeout(timer)
  autoRetryTimers.delete(cardId)
}

/**
 * A turn of the advisor's own card sees every message its waiting one-shot
 * retries would answer, so those are dropped rather than answering again.
 */
function dropWaitingOneShots(windowId: string): void {
  if (oneShotCards.size === 0) return
  const state = useStore.getState()
  const stale = new Set(state.queue
    .filter((c) => c.windowId === windowId && c.status === 'waiting' && oneShotCards.has(c.id))
    .map((c) => c.id))
  if (stale.size === 0) return
  for (const id of stale) {
    oneShotCards.delete(id)
    cancelAutoRetry(id)
  }
  state.setQueue(state.queue.filter((c) => !stale.has(c.id)))
}

/** Clears per-run bookkeeping when a new run starts (Start, or Retry while stopped). */
function beginRun(): void {
  useStore.setState({ roundsCompleted: 0 })
  retriedCards.clear()
  userMessageAwaitingTurn = false
  advisorRepliedThisRound = false
  cancelAutoRetries()
}

function removeOneShotCards(onlyFinished: boolean): void {
  if (oneShotCards.size === 0) return
  const state = useStore.getState()
  const done = state.queue.filter((c) => oneShotCards.has(c.id) && (!onlyFinished || c.status === 'completed' || c.status === 'errored'))
  if (!onlyFinished) oneShotCards.clear()
  if (done.length === 0) return
  const doneIds = new Set(done.map((c) => c.id))
  for (const id of doneIds) oneShotCards.delete(id)
  state.setQueue(state.queue.filter((c) => !doneIds.has(c.id)))
}

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
    if (cards.length === 0) finishRoundIfDone()
    return
  }

  const next = getNextCard(queue, turnMode, isPaused)
  if (next !== null) {
    dispatchAgentTurn(next)
    return
  }
  finishRoundIfDone()
}

/**
 * Nothing left to dispatch: if every card has finished and no reply is still
 * streaming, the round is over (e.g. the user just answered the round's last
 * turn, or its last waiting card — or every card — was removed while paused),
 * so it ends here instead of leaving the run waiting for nothing. A removed
 * advisor's reply can still be streaming after its card left the queue; its
 * end carries the round on.
 */
function finishRoundIfDone(): void {
  const state = useStore.getState()
  if (state.activeCardIds.length === 0 && activeControllers.size === 0 && isCycleComplete(state.queue)) onTurnComplete()
}

/**
 * Called when the user submits a message during sequential/queue modes.
 * Marks the user card as completed and triggers the next agent.
 */
export function handleUserMessage(): void {
  const state = useStore.getState()
  // No run (e.g. Start found no advisor to run): the message uses no turn, so
  // the queue keeps its user turn for the next run.
  if (!state.isRunning) return
  const userTurnOpen = state.queue.some((c) => c.isUser && c.status === 'waiting')
  // Only when the lone advisor can't see this message: its card has already
  // started or finished. A card still waiting will read the message anyway.
  const advisorStillWaiting = state.queue.some((c) => !c.isUser && c.status === 'waiting')
  if (!userTurnOpen && !advisorStillWaiting && state.isRunning && isSoloSequentialQueue(state.queue, state.turnMode)) {
    userMessageAwaitingTurn = true
  }
  const updatedQueue = completeUserTurn(state.queue)
  state.setQueue(updatedQueue)
  // Nothing left to answer (e.g. the only advisor was removed): end the run.
  if (state.isRunning && !hasActiveAgent(updatedQueue)) {
    prepQueueForNextRound()
    return
  }
  dispatchNextTurn()
}

/**
 * Starts a run cycle. In sequential/queue mode, starts from the first card.
 * In parallel mode, dispatches all agents at once.
 */
export function startRun(): void {
  beginRun()
  const state = useStore.getState()
  const queue = prepareQueueForRun(state.queue, state.turnMode, isLiveRetryCard)
  state.setQueue(queue)
  // With no advisor left to run, a started run could never dispatch or finish.
  if (!hasActiveAgent(queue)) return
  state.setIsRunning(true)
  dispatchNextTurn()
}

/**
 * Stops all active streams and pauses the queue.
 *
 * Aborts:
 *   - Every advisor turn in `activeControllers` (managed locally)
 *   - The in-flight compile, if any (lives in compile-controller's
 *     module-scoped registry — separate from activeControllers because
 *     compile is not a turn)
 *
 * This is the single "stop everything spending money" entry point. The
 * budget-exceeded paths in dispatchNextTurn and onTurnComplete call this,
 * so the budget cap correctly halts BOTH advisor turns and compile.
 */
export function stopAll(): void {
  userMessageAwaitingTurn = false
  cancelAutoRetries()
  removeOneShotCards(false)
  // Abort the compile stream first — it's a one-shot, no per-window cleanup
  // needed, so doing it before the advisor loop minimizes the window where
  // a still-running compile could fire callbacks against state we're about
  // to mutate.
  abortActiveCompile()

  const entries = [...activeControllers.entries()]
  activeControllers.clear()
  const state = useStore.getState()
  for (const [cardId, { controller, windowId, provider, model }] of entries) {
    controller.abort()
    state.removeActiveCard(cardId)

    // Preserve partial content as a message with cut-off marker (fresh read per window).
    // We don't have token usage from the aborted stream — buildCostMetadata still
    // returns confirmed-$0 metadata for known-free models so the partial isn't
    // miscounted as "untracked" in the cost breakdown.
    const win = useStore.getState().windows[windowId]
    if (win != null && win.streamContent.trim() !== '') {
      const partialContent = `${win.streamContent.trim()}\n\n*(response cut off)*`
      const costMeta = buildCostMetadata(undefined, model, provider)
      const message = createAssistantMessage(
        partialContent,
        win.personaLabel,
        windowId,
        costMeta,
      )
      state.appendMessage(message)
    }

    state.updateWindow(windowId, { isStreaming: false, streamContent: '' })
  }
  // Prep queue for next start — reset all cards to waiting. Errored advisors
  // stay in the rotation (they keep showing their error); skipped cards leave.
  state.setQueue(
    state.queue
      .filter((c) => c.status !== 'skipped')
      .map((c) => ({ ...c, status: 'waiting' as const, errorLabel: null })),
  )
  state.setIsRunning(false)
  state.setPaused(false)
  useStore.setState({ roundsCompleted: 0 })
  retriedCards.clear()
}

/**
 * Retries a specific advisor that previously errored.
 * Clears the error, creates a fresh queue card, and dispatches it.
 */
export function retryAdvisor(windowId: string): void {
  const state = useStore.getState()
  const window = state.windows[windowId]
  if (window === undefined) return

  state.updateWindow(windowId, { error: null })

  const card = createRetryCard(windowId)
  liveRetryCards.add(card.id)

  // Retry while stopped starts a new run, cleaned up as Start does.
  if (!state.isRunning) beginRun()
  const placement = state.isRunning
    ? queueForRetryWhileRunning(state.queue, card)
    : queueForRetryFromStop(state.queue, card, state.turnMode, isLiveRetryCard)
  if (placement.oneShot) oneShotCards.add(card.id)
  state.setQueue(placement.queue)
  state.setIsRunning(true)
  dispatchAgentTurn(card)
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
  // Only a card still waiting in the queue runs, and only during a run; a
  // stale card list could otherwise run a card twice, run one that was
  // removed, or run one after the run ended.
  const current = useStore.getState()
  const queued = current.queue.find((c) => c.id === card.id)
  if (!current.isRunning || queued?.status !== 'waiting') return
  // Running the card now supersedes a pending auto-retry of it (e.g. a message
  // sent during the wait dispatched it), which would otherwise run it again.
  cancelAutoRetry(card.id)
  if (!oneShotCards.has(card.id)) dropWaitingOneShots(card.windowId)

  const state = useStore.getState()
  const window = state.windows[card.windowId]
  if (window === undefined) {
    state.setCardStatus(card.id, 'errored', 'Window not found')
    onTurnComplete()
    return
  }

  // Validate key and persona before marking card as active
  const credential = resolveAdvisorCredential(window, state.keys, getRawKey)
  if (credential.kind === 'missing-key') {
    failTurnBeforeRequest(card, window, 'API key not found')
    return
  }

  if (credential.kind === 'unreadable-key') {
    failTurnBeforeRequest(card, window, 'Could not retrieve API key')
    return
  }

  const persona = state.personas.find((p) => p.id === window.personaId)
  let personaContent = persona?.content ?? ''

  // When duplicate personas exist, hint the model to provide unique perspectives.
  // Skip for "No Persona" advisors — there's no persona to be unique about.
  const displayLabels = computeDisplayLabels(state.windowOrder, state.windows)
  const displayLabel = displayLabels.get(card.windowId) ?? window.personaLabel
  const hasDuplicates = displayLabel !== window.personaLabel
  if (hasDuplicates && window.personaId !== '') {
    personaContent += `\n\nNote: There may be other ${window.personaLabel} advisors in this chat. Provide unique perspectives still based in truth where possible, but don't be contrarian for the sake of it.`
  }

  const advisorPromptOverride = resolveAdvisorSystemPrompt(state.systemPromptsConfig, state.customSystemPrompts)
  const systemPrompt = buildSystemPrompt(personaContent, state.sessionInstructions || undefined, advisorPromptOverride)
  const threadMessages = messagesToApiFormat(state.messages, {
    windowId: card.windowId,
    personaLabel: window.personaLabel,
  })

  // This request includes every message sent so far, so a message still
  // waiting for the next round (see userMessageAwaitingTurn) is answered by it
  // (e.g. a transient-error auto-retry of a reply that started before it).
  userMessageAwaitingTurn = false

  // Mark card as active and prepare callbacks before setting isStreaming
  state.setCardStatus(card.id, 'active')
  state.addActiveCard(card.id)

  const callbacks: StreamCallbacks = {
    onChunk: (content) => {
      advisorRepliedThisRound = true
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
      advisorRepliedThisRound = true

      const current = useStore.getState()
      const freshWindow = current.windows[card.windowId]
      const costMeta = buildCostMetadata(tokenUsage, window.model, window.provider)

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
    onStale: () => {
      // Another conversation is loaded now; its queue and windows are not ours to touch.
      activeControllers.delete(card.id)
    },
    onError: (error, tokenUsage, statusCode) => {
      activeControllers.delete(card.id)

      // Discard late-arriving errors after user explicitly stopped
      if (controller.signal.aborted) return

      const current = useStore.getState()
      const freshWindow = current.windows[card.windowId]
      const costMeta = buildCostMetadata(tokenUsage, window.model, window.provider)

      // Auto-retry once on transient errors if enabled
      if (
        current.autoRetryTransient &&
        isTransientError(statusCode) &&
        !retriedCards.has(card.id)
      ) {
        retriedCards.add(card.id)
        current.updateWindow(card.windowId, {
          isStreaming: false,
          streamContent: '',
          error: null,
          runningCost: (freshWindow?.runningCost ?? 0) + (costMeta?.estimatedCost ?? 0),
        })
        current.setCardStatus(card.id, 'waiting')
        current.removeActiveCard(card.id)
        scheduleAutoRetry(card)
        return
      }

      current.updateWindow(card.windowId, {
        isStreaming: false,
        streamContent: '',
        error,
        runningCost: (freshWindow?.runningCost ?? 0) + (costMeta?.estimatedCost ?? 0),
      })
      current.setCardStatus(card.id, 'errored', error)

      // Auto-push to error log so it appears in the left sidebar
      current.addErrorLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        advisorLabel: freshWindow?.personaLabel ?? window.personaLabel,
        accentColor: freshWindow?.accentColor ?? window.accentColor,
        message: error,
        provider: freshWindow?.provider ?? window.provider,
        model: freshWindow?.model ?? window.model,
      })
      current.removeActiveCard(card.id)

      // Use queueMicrotask to avoid unbounded recursive call stack
      queueMicrotask(onTurnComplete)
    },
  }

  // Register controller before isStreaming to avoid cancellation gap
  let controller: AbortController
  try {
    controller = streamResponse(
      {
        provider: window.provider,
        model: window.model,
        ...credentialRequestFields(credential),
        systemPrompt,
        messages: threadMessages,
      },
      callbacks,
    )
  } catch (err) {
    // A request that can't even be set up (e.g. a missing custom adapter)
    // fails this turn instead of leaving the card active and the run stuck.
    failTurnBeforeRequest(card, window, err instanceof Error ? err.message : 'Could not start the request')
    return
  }

  activeControllers.set(card.id, { controller, windowId: card.windowId, provider: window.provider, model: window.model })
  useStore.getState().updateWindow(card.windowId, { isStreaming: true, streamContent: '', error: null })
}

/** Runs a card again after a transient error (see onError), unless something else ran it first. */
function scheduleAutoRetry(card: QueueCard): void {
  const timer = setTimeout(() => {
    autoRetryTimers.delete(card.id)
    const latest = useStore.getState()
    if (!latest.isRunning) return
    // Wait out a pause: a one-shot retry card sits behind the user turn, so Resume alone wouldn't run it.
    if (latest.isPaused) {
      scheduleAutoRetry(card)
      return
    }
    const queued = latest.queue.find((c) => c.id === card.id)
    if (queued?.status === 'waiting') {
      dispatchAgentTurn(queued)
      return
    }
    // Skipped or removed meanwhile: carry the run on, unless another turn is
    // still in progress (its end carries the run on).
    if (latest.activeCardIds.length === 0) onTurnComplete()
  }, 1_000)
  autoRetryTimers.set(card.id, timer)
}

/** Fails a turn whose request never started; the advisor shows the error and the round moves on. */
function failTurnBeforeRequest(card: QueueCard, window: AdvisorWindow, message: string): void {
  const state = useStore.getState()
  state.removeActiveCard(card.id)
  state.setCardStatus(card.id, 'errored', message)
  state.updateWindow(card.windowId, { isStreaming: false, error: message })
  state.addErrorLog({ id: crypto.randomUUID(), timestamp: Date.now(), advisorLabel: window.personaLabel, accentColor: window.accentColor, message, provider: window.provider, model: window.model })
  onTurnComplete()
}

function onTurnComplete(): void {
  removeOneShotCards(true)
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

  // Auto-compaction sweep — checks each window's `shouldCompact` against its
  // own model's context window. The smallest-context advisor effectively drives
  // compaction because compactWindow shrinks the shared message bus globally.
  // Per-window guards (compactingWindows set) prevent duplicate concurrent jobs.
  checkAutoCompaction()

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
    const anyReply = advisorRepliedThisRound
    useStore.setState({ roundsCompleted })
    resetQueueForNextRound()
    const next = useStore.getState()
    // End the run instead of looping without end when no advisor is left to
    // run (all removed or dropped), or when no advisor replied this round
    // (e.g. missing API keys, or requests refused before reaching the network)
    // and nothing holds the next round back: no user turn waits in the queue
    // and the mode isn't Manual. The errors stay shown.
    if (!hasActiveAgent(next.queue) || (!anyReply && next.turnMode !== 'manual' && !userTurnWaiting(next.queue))) {
      prepQueueForNextRound()
      return
    }
    queueMicrotask(() => dispatchNextTurn())
    return
  }

  // Continue dispatching next turns within the current cycle
  dispatchNextTurn()
}

/** Resets queue cards to 'waiting' for the next round; skipped cards leave the rotation. */
function resetQueueForNextRound(): void {
  const state = useStore.getState()
  const reset = state.queue
    .filter((c) => c.status !== 'skipped')
    .map((c) => ({
      ...c,
      status: 'waiting' as const,
      errorLabel: null,
    }))
  // Re-checked every round: cards can be skipped or removed mid-run.
  const next = dropOrphanUserTurns(ensureUserTurnForSoloAgent(reset, state.turnMode))
  const pending = userMessageAwaitingTurn
  userMessageAwaitingTurn = false
  advisorRepliedThisRound = false
  state.setQueue(pending ? completeUserTurn(next) : next)
}

/** Whether a user turn waits in the queue, so a round can't finish until the user answers. */
function userTurnWaiting(queue: readonly QueueCard[]): boolean {
  return queue.some((c) => c.isUser && c.status === 'waiting')
}

/** Stops running and preps the queue so the user can hit Start again. */
function prepQueueForNextRound(): void {
  const state = useStore.getState()
  // The run is over; a message pending for its next round must not carry into a later run.
  userMessageAwaitingTurn = false
  cancelAutoRetries()
  // As at Stop: errored advisors stay in the rotation, skipped cards leave.
  state.setQueue(
    dropOrphanUserTurns(
      state.queue
        .filter((c) => c.status !== 'skipped')
        .map((c) => ({ ...c, status: 'waiting' as const, errorLabel: null })),
    ),
  )
  state.setIsRunning(false)
  state.setPaused(false)
  useStore.setState({ roundsCompleted: 0 })
}
