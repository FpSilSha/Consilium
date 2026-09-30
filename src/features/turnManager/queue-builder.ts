import type { QueueCard, TurnMode } from '@/types'

const USER_WINDOW_ID = '__user__'

export function createUserCard(): QueueCard {
  return {
    id: `user_${crypto.randomUUID().slice(0, 8)}`,
    windowId: USER_WINDOW_ID,
    isUser: true,
    status: 'waiting',
    errorLabel: null,
  }
}

export function createAgentCard(windowId: string): QueueCard {
  return {
    id: `${windowId}_${crypto.randomUUID().slice(0, 8)}`,
    windowId,
    isUser: false,
    status: 'waiting',
    errorLabel: null,
  }
}

/** Retry cards carry this id prefix, so a leftover one can be recognised after a restart. */
const RETRY_CARD_PREFIX = 'retry_'

export function createRetryCard(windowId: string): QueueCard {
  return { ...createAgentCard(windowId), id: `${RETRY_CARD_PREFIX}${crypto.randomUUID()}` }
}

/**
 * A one-shot retry card restored from a saved session (the app closed
 * mid-retry) would otherwise stay as a duplicate of the advisor's own card.
 * Such a card is dropped when the advisor has another card, unless it was
 * created in this app session (`isLive`), where the dispatcher manages it.
 */
export function dropLeftoverRetryCards(
  queue: readonly QueueCard[],
  isLive: (cardId: string) => boolean,
): readonly QueueCard[] {
  const ownCards = new Set(queue.filter((c) => !c.isUser && c.status !== 'skipped' && !c.id.startsWith(RETRY_CARD_PREFIX)).map((c) => c.windowId))
  const leftovers = queue.filter((c) => c.id.startsWith(RETRY_CARD_PREFIX) && !isLive(c.id) && ownCards.has(c.windowId))
  return leftovers.length === 0 ? queue : queue.filter((c) => !leftovers.includes(c))
}

/**
 * Resets a queue for a new run: errored, finished or in-progress cards wait
 * again (an error keeps its advisor in the rotation; the advisor still shows
 * it). A session saved mid-reply would otherwise restore an "active" card
 * that never completes. Skipped cards stay skipped.
 */
export function resetQueueForNewRun(queue: readonly QueueCard[]): readonly QueueCard[] {
  return queue
    .map((c) => (c.status === 'skipped' || (c.status === 'waiting' && c.errorLabel === null)
      ? c
      : { ...c, status: 'waiting' as const, errorLabel: null }))
}

export function isUserCard(card: QueueCard): boolean {
  return card.isUser
}

/**
 * Builds the initial queue for a given turn mode and set of window IDs.
 * Sequential: User → Agent1 → Agent2 → ... → (loop)
 * Parallel: All agents simultaneously (no user card in rotation)
 * Manual: All agents listed but none auto-dispatched
 * Queue: Same as sequential initially, user reorders via drag-and-drop
 */
export function buildInitialQueue(
  windowIds: readonly string[],
  mode: TurnMode,
): readonly QueueCard[] {
  if (mode === 'parallel') {
    return windowIds.map((id) => createAgentCard(id))
  }

  // Sequential, manual, and queue modes include a user card
  const cards: QueueCard[] = [createUserCard()]
  for (const id of windowIds) {
    cards.push(createAgentCard(id))
  }
  return cards
}

function activeAgentIds(queue: readonly QueueCard[]): ReadonlySet<string> {
  return new Set(queue.filter((card) => !card.isUser && card.status !== 'skipped').map((card) => card.windowId))
}

/** Seq mode with exactly one distinct AI in the queue (skipped cards ignored). */
export function isSoloSequentialQueue(queue: readonly QueueCard[], mode: TurnMode): boolean {
  return mode === 'sequential' && activeAgentIds(queue).size === 1
}

/**
 * In Seq mode a queue with a single AI and no user turn would let that
 * advisor answer itself round after round (and, on a subscription, spend the
 * user's plan doing it). Such a queue gets a user turn at the front, so the
 * advisor replies once and then waits for the user. With two or more AIs the
 * queue is left alone, so advisors can still discuss among themselves.
 *
 * `canReply` lets a new run leave out advisors that are currently failing
 * (e.g. a missing API key), so a working advisor paired only with failing
 * ones still waits for the user. If none can reply, all of them count.
 */
export function ensureUserTurnForSoloAgent(
  queue: readonly QueueCard[],
  mode: TurnMode,
  canReply: (windowId: string) => boolean = () => true,
): readonly QueueCard[] {
  if (mode !== 'sequential') return queue
  const agents = [...activeAgentIds(queue)]
  const replying = agents.filter(canReply).length
  if ((replying > 0 ? replying : agents.length) !== 1) return queue
  if (queue.some((card) => card.isUser && card.status !== 'skipped')) return queue
  return [createUserCard(), ...queue]
}

/**
 * A user turn with no advisor card left would start a run that can never
 * dispatch or finish, so user cards are dropped once no advisor card remains
 * (leaving the empty queue and its "+ All Advisors" recovery). A queue whose
 * advisors are all skipped keeps its user turn for when one is unskipped; it
 * doesn't start a run meanwhile (see hasActiveAgent).
 */
export function dropOrphanUserTurns(queue: readonly QueueCard[]): readonly QueueCard[] {
  if (queue.length === 0 || queue.some((card) => !card.isUser)) return queue
  return []
}

/** Whether the queue has an advisor card that can still run. */
export function hasActiveAgent(queue: readonly QueueCard[]): boolean {
  return activeAgentIds(queue).size > 0
}

/**
 * The queue a new run starts from (Start, or Retry while stopped): a clean
 * queue (a restored session may carry mid-run statuses), no leftover retry
 * duplicates, a user turn for a lone AI in Seq mode, and no user turn
 * without an advisor.
 */
export function prepareQueueForRun(
  queue: readonly QueueCard[],
  mode: TurnMode,
  isLiveRetryCard: (cardId: string) => boolean,
  canReply?: (windowId: string) => boolean,
): readonly QueueCard[] {
  const withoutLeftovers = dropLeftoverRetryCards(resetQueueForNewRun(queue), isLiveRetryCard)
  return dropOrphanUserTurns(ensureUserTurnForSoloAgent(withoutLeftovers, mode, canReply))
}

/** Where a retry card goes, and whether it runs once and leaves the queue. */
export interface RetryPlacement {
  readonly queue: readonly QueueCard[]
  readonly oneShot: boolean
}

const replaceAt = (queue: readonly QueueCard[], index: number, card: QueueCard): readonly QueueCard[] =>
  queue.map((c, i) => (i === index ? card : c))

/**
 * The queue for a Retry pressed during a run, so the advisor answers each
 * message once and keeps exactly one card in the rotation:
 * - its errored card is replaced in place, so the advisor keeps one card in
 *   its place;
 * - a card of its own still to run this round with no user turn before it
 *   would answer the same messages again, so the retry takes that turn now;
 * - if it has another card (one that already ran, or one waiting for the
 *   user's next message), the retry is a one-shot extra turn;
 * - with no card left (e.g. removed from the queue), the retry card becomes its card.
 */
export function queueForRetryWhileRunning(queue: readonly QueueCard[], retryCard: QueueCard): RetryPlacement {
  const isAdvisorCard = (c: QueueCard): boolean => c.windowId === retryCard.windowId && !c.isUser && c.status !== 'skipped'
  const erroredAt = queue.findIndex((c) => isAdvisorCard(c) && c.status === 'errored')
  if (erroredAt !== -1) return { queue: replaceAt(queue, erroredAt, retryCard), oneShot: false }
  const waitingAt = queue.findIndex((c) => isAdvisorCard(c) && c.status === 'waiting')
  const userTurnFirst = queue.slice(0, Math.max(waitingAt, 0)).some((c) => c.isUser && c.status === 'waiting')
  if (waitingAt !== -1 && !userTurnFirst) return { queue: replaceAt(queue, waitingAt, retryCard), oneShot: false }
  return { queue: [...queue, retryCard], oneShot: queue.some(isAdvisorCard) }
}

/**
 * The queue for a Retry pressed while stopped, which starts a new run with
 * Start's clean-up and then places the retry as during a run (see
 * queueForRetryWhileRunning). An errored card of the advisor (a session saved
 * mid-round) marks where the round stopped, so the retry takes its place
 * before the clean-up would make it wait again. When the retry takes a turn
 * (it isn't a one-shot), the round resumes there: in Seq and Queue mode the
 * turns before it count as taken (a user turn ahead of it would otherwise wait
 * for a message the retry is already answering), in Parallel mode every other
 * advisor's turn does, and Manual mode marks nothing.
 */
export function queueForRetryFromStop(
  queue: readonly QueueCard[],
  retryCard: QueueCard,
  mode: TurnMode,
  isLiveRetryCard: (cardId: string) => boolean,
  canReply?: (windowId: string) => boolean,
): RetryPlacement {
  const isAdvisorCard = (c: QueueCard): boolean => c.windowId === retryCard.windowId && !c.isUser && c.status !== 'skipped'
  const erroredAt = queue.findIndex((c) => isAdvisorCard(c) && c.status === 'errored')
  const keepsCard = queue.some((c) => isAdvisorCard(c) && c.status !== 'errored')
  const slotted = !keepsCard && erroredAt !== -1 ? replaceAt(queue, erroredAt, retryCard) : queue
  const prepared = prepareQueueForRun(slotted, mode, isLiveRetryCard, canReply)
  const placement = prepared.some((c) => c.id === retryCard.id)
    ? { queue: prepared, oneShot: false }
    : queueForRetryWhileRunning(prepared, retryCard)
  if (placement.oneShot || mode === 'manual') return placement
  const resumeAt = placement.queue.findIndex((c) => c.id === retryCard.id)
  const taken = (i: number): boolean => (mode === 'parallel' ? i !== resumeAt : i < resumeAt)
  return {
    queue: placement.queue.map((c, i) => (taken(i) && c.status === 'waiting' ? { ...c, status: 'completed' as const } : c)),
    oneShot: false,
  }
}
