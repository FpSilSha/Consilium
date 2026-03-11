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
