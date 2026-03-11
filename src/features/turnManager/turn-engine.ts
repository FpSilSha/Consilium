import type { QueueCard, TurnMode } from '@/types'

/**
 * Determines the next card to activate based on the current queue state and turn mode.
 * Returns null if no card should be activated (e.g., paused, user's turn, all done).
 */
export function getNextCard(
  queue: readonly QueueCard[],
  mode: TurnMode,
  isPaused: boolean,
): QueueCard | null {
  if (isPaused) return null

  // Find the first waiting card
  const nextWaiting = queue.find((c) => c.status === 'waiting')
  if (nextWaiting === undefined) return null

  switch (mode) {
    case 'sequential':
    case 'queue':
      // If next card is user, don't auto-dispatch — wait for user input
      if (nextWaiting.isUser) return null
      return nextWaiting

    case 'parallel':
      // In parallel mode, all waiting agents are dispatched at once
      // The caller should call this in a loop or use getAllParallelCards
      return nextWaiting

    case 'manual':
      // Manual mode never auto-dispatches
      return null
  }
}

/**
 * In parallel mode, returns all waiting agent cards (to dispatch simultaneously).
 */
export function getAllParallelCards(
  queue: readonly QueueCard[],
): readonly QueueCard[] {
  return queue.filter((c) => c.status === 'waiting' && !c.isUser)
}

/**
 * Checks whether the current cycle is complete (all cards processed).
 */
export function isCycleComplete(queue: readonly QueueCard[]): boolean {
  return queue.every(
    (c) => c.status === 'completed' || c.status === 'errored' || c.status === 'skipped',
  )
}

/**
 * After a user submits a message, marks the user card as completed
 * and returns the updated queue.
 */
export function completeUserTurn(
  queue: readonly QueueCard[],
): readonly QueueCard[] {
  const firstWaitingUser = queue.findIndex(
    (c) => c.isUser && c.status === 'waiting',
  )
  if (firstWaitingUser === -1) return queue

  return queue.map((c, i) =>
    i === firstWaitingUser ? { ...c, status: 'completed' as const } : c,
  )
}

/**
 * Checks if it's currently the user's turn (next waiting card is a user card).
 */
export function isUserTurn(queue: readonly QueueCard[]): boolean {
  const nextWaiting = queue.find((c) => c.status === 'waiting')
  return nextWaiting?.isUser === true
}

/**
 * Returns cards in the errored zone (for sidebar display).
 */
export function getErroredCards(
  queue: readonly QueueCard[],
): readonly QueueCard[] {
  return queue.filter((c) => c.status === 'errored')
}

/**
 * Returns cards in the active queue (non-errored, for sidebar display).
 */
export function getActiveQueueCards(
  queue: readonly QueueCard[],
): readonly QueueCard[] {
  return queue.filter((c) => c.status !== 'errored')
}
