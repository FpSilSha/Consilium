import { describe, it, expect } from 'vitest'
import {
  getNextCard,
  getAllParallelCards,
  isCycleComplete,
  completeUserTurn,
  isUserTurn,
  getErroredCards,
  getActiveQueueCards,
} from './turn-engine'
import type { QueueCard, TurnMode } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0
function makeCard(
  overrides: Partial<QueueCard> & { isUser?: boolean },
): QueueCard {
  _idCounter += 1
  return {
    id: `card-${_idCounter}`,
    windowId: `win-${_idCounter}`,
    isUser: false,
    status: 'waiting',
    errorLabel: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getNextCard
// ---------------------------------------------------------------------------

describe('getNextCard', () => {
  describe('paused state', () => {
    it('returns null when isPaused is true regardless of mode', () => {
      const queue = [makeCard({})]
      const modes: TurnMode[] = ['sequential', 'parallel', 'manual', 'queue']
      for (const mode of modes) {
        expect(getNextCard(queue, mode, true)).toBeNull()
      }
    })

    it('returns null when isPaused is true even with waiting agent cards', () => {
      const queue = [makeCard({ isUser: false, status: 'waiting' })]
      expect(getNextCard(queue, 'sequential', true)).toBeNull()
    })
  })

  describe('empty queue', () => {
    it('returns null for an empty queue in sequential mode', () => {
      expect(getNextCard([], 'sequential', false)).toBeNull()
    })

    it('returns null for an empty queue in parallel mode', () => {
      expect(getNextCard([], 'parallel', false)).toBeNull()
    })
  })

  describe('sequential mode', () => {
    it('returns the first waiting agent card', () => {
      const agent = makeCard({ isUser: false, status: 'waiting' })
      const queue = [agent]
      expect(getNextCard(queue, 'sequential', false)).toBe(agent)
    })

    it('returns null when next waiting card is a user card', () => {
      const userCard = makeCard({ isUser: true, status: 'waiting' })
      expect(getNextCard([userCard], 'sequential', false)).toBeNull()
    })

    it('skips completed cards and finds first waiting agent', () => {
      const completed = makeCard({ status: 'completed' })
      const agent = makeCard({ isUser: false, status: 'waiting' })
      expect(getNextCard([completed, agent], 'sequential', false)).toBe(agent)
    })

    it('skips errored and skipped cards before returning first waiting agent', () => {
      const errored = makeCard({ status: 'errored' })
      const skipped = makeCard({ status: 'skipped' })
      const agent = makeCard({ isUser: false, status: 'waiting' })
      expect(getNextCard([errored, skipped, agent], 'sequential', false)).toBe(agent)
    })

    it('returns null when all cards are non-waiting statuses', () => {
      const queue = [
        makeCard({ status: 'completed' }),
        makeCard({ status: 'errored' }),
        makeCard({ status: 'skipped' }),
      ]
      expect(getNextCard(queue, 'sequential', false)).toBeNull()
    })
  })

  describe('queue mode (same semantics as sequential)', () => {
    it('returns the first waiting agent card', () => {
      const agent = makeCard({ isUser: false, status: 'waiting' })
      expect(getNextCard([agent], 'queue', false)).toBe(agent)
    })

    it('returns null when next waiting card is a user card', () => {
      const userCard = makeCard({ isUser: true, status: 'waiting' })
      expect(getNextCard([userCard], 'queue', false)).toBeNull()
    })
  })

  describe('parallel mode', () => {
    it('returns the first waiting card (agent or user) without blocking on user', () => {
      const userCard = makeCard({ isUser: true, status: 'waiting' })
      // In parallel mode, getNextCard returns the first waiting card regardless of isUser
      expect(getNextCard([userCard], 'parallel', false)).toBe(userCard)
    })

    it('returns first waiting agent card in parallel mode', () => {
      const agent = makeCard({ isUser: false, status: 'waiting' })
      expect(getNextCard([agent], 'parallel', false)).toBe(agent)
    })

    it('returns null when there are no waiting cards in parallel mode', () => {
      const queue = [makeCard({ status: 'completed' })]
      expect(getNextCard(queue, 'parallel', false)).toBeNull()
    })
  })

  describe('manual mode', () => {
    it('always returns null regardless of queue state', () => {
      const agent = makeCard({ isUser: false, status: 'waiting' })
      expect(getNextCard([agent], 'manual', false)).toBeNull()
    })

    it('returns null even when multiple agent cards are waiting', () => {
      const queue = [
        makeCard({ isUser: false, status: 'waiting' }),
        makeCard({ isUser: false, status: 'waiting' }),
      ]
      expect(getNextCard(queue, 'manual', false)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// getAllParallelCards
// ---------------------------------------------------------------------------

describe('getAllParallelCards', () => {
  it('returns all waiting non-user cards', () => {
    const agent1 = makeCard({ isUser: false, status: 'waiting' })
    const agent2 = makeCard({ isUser: false, status: 'waiting' })
    const result = getAllParallelCards([agent1, agent2])
    expect(result).toEqual([agent1, agent2])
  })

  it('excludes user cards even if they are waiting', () => {
    const userCard = makeCard({ isUser: true, status: 'waiting' })
    const agentCard = makeCard({ isUser: false, status: 'waiting' })
    const result = getAllParallelCards([userCard, agentCard])
    expect(result).toEqual([agentCard])
  })

  it('excludes non-waiting agent cards', () => {
    const active = makeCard({ isUser: false, status: 'active' })
    const completed = makeCard({ isUser: false, status: 'completed' })
    const waiting = makeCard({ isUser: false, status: 'waiting' })
    const result = getAllParallelCards([active, completed, waiting])
    expect(result).toEqual([waiting])
  })

  it('returns empty array when queue is empty', () => {
    expect(getAllParallelCards([])).toEqual([])
  })

  it('returns empty array when all cards belong to users', () => {
    const queue = [
      makeCard({ isUser: true, status: 'waiting' }),
      makeCard({ isUser: true, status: 'waiting' }),
    ]
    expect(getAllParallelCards(queue)).toEqual([])
  })

  it('returns empty array when all agent cards are non-waiting', () => {
    const queue = [
      makeCard({ isUser: false, status: 'completed' }),
      makeCard({ isUser: false, status: 'errored' }),
    ]
    expect(getAllParallelCards(queue)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isCycleComplete
// ---------------------------------------------------------------------------

describe('isCycleComplete', () => {
  it('returns true for an empty queue', () => {
    expect(isCycleComplete([])).toBe(true)
  })

  it('returns true when every card is completed', () => {
    const queue = [
      makeCard({ status: 'completed' }),
      makeCard({ status: 'completed' }),
    ]
    expect(isCycleComplete(queue)).toBe(true)
  })

  it('returns true when cards are a mix of completed, errored, and skipped', () => {
    const queue = [
      makeCard({ status: 'completed' }),
      makeCard({ status: 'errored' }),
      makeCard({ status: 'skipped' }),
    ]
    expect(isCycleComplete(queue)).toBe(true)
  })

  it('returns false when any card is still waiting', () => {
    const queue = [
      makeCard({ status: 'completed' }),
      makeCard({ status: 'waiting' }),
    ]
    expect(isCycleComplete(queue)).toBe(false)
  })

  it('returns false when any card is active', () => {
    const queue = [
      makeCard({ status: 'completed' }),
      makeCard({ status: 'active' }),
    ]
    expect(isCycleComplete(queue)).toBe(false)
  })

  it('returns false when all cards are waiting', () => {
    const queue = [makeCard({ status: 'waiting' }), makeCard({ status: 'waiting' })]
    expect(isCycleComplete(queue)).toBe(false)
  })

  it('returns false for a single active card', () => {
    expect(isCycleComplete([makeCard({ status: 'active' })])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// completeUserTurn
// ---------------------------------------------------------------------------

describe('completeUserTurn', () => {
  it('marks the first waiting user card as completed', () => {
    const userCard = makeCard({ isUser: true, status: 'waiting' })
    const result = completeUserTurn([userCard])
    expect(result[0]?.status).toBe('completed')
  })

  it('only marks the first waiting user card, leaving subsequent ones untouched', () => {
    const user1 = makeCard({ isUser: true, status: 'waiting' })
    const user2 = makeCard({ isUser: true, status: 'waiting' })
    const result = completeUserTurn([user1, user2])
    expect(result[0]?.status).toBe('completed')
    expect(result[1]?.status).toBe('waiting')
  })

  it('does not modify non-user cards', () => {
    const agent = makeCard({ isUser: false, status: 'waiting' })
    const user = makeCard({ isUser: true, status: 'waiting' })
    const result = completeUserTurn([agent, user])
    expect(result[0]?.status).toBe('waiting')
    expect(result[1]?.status).toBe('completed')
  })

  it('returns the original queue reference when no waiting user card exists', () => {
    const queue = [makeCard({ isUser: false, status: 'waiting' })]
    const result = completeUserTurn(queue)
    expect(result).toBe(queue)
  })

  it('returns the original queue reference for an empty queue', () => {
    const queue: readonly QueueCard[] = []
    const result = completeUserTurn(queue)
    expect(result).toBe(queue)
  })

  it('does not mutate the original array (returns a new array)', () => {
    const user = makeCard({ isUser: true, status: 'waiting' })
    const original: readonly QueueCard[] = [user]
    const result = completeUserTurn(original)
    expect(result).not.toBe(original)
    // Original card object itself is not mutated
    expect(user.status).toBe('waiting')
  })

  it('does not mark already-completed user cards as completed again', () => {
    const alreadyDone = makeCard({ isUser: true, status: 'completed' })
    const waitingUser = makeCard({ isUser: true, status: 'waiting' })
    const result = completeUserTurn([alreadyDone, waitingUser])
    // alreadyDone was not waiting so it is not the target; waitingUser gets completed
    expect(result[0]?.status).toBe('completed') // unchanged
    expect(result[1]?.status).toBe('completed') // newly completed
  })

  it('preserves all other card fields when completing', () => {
    const user = makeCard({ isUser: true, status: 'waiting', errorLabel: null })
    const result = completeUserTurn([user])
    const completed = result[0]!
    expect(completed.id).toBe(user.id)
    expect(completed.windowId).toBe(user.windowId)
    expect(completed.isUser).toBe(true)
    expect(completed.errorLabel).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isUserTurn
// ---------------------------------------------------------------------------

describe('isUserTurn', () => {
  it('returns true when the first waiting card is a user card', () => {
    const queue = [makeCard({ isUser: true, status: 'waiting' })]
    expect(isUserTurn(queue)).toBe(true)
  })

  it('returns false when the first waiting card is an agent card', () => {
    const queue = [makeCard({ isUser: false, status: 'waiting' })]
    expect(isUserTurn(queue)).toBe(false)
  })

  it('returns false when there are no waiting cards at all', () => {
    const queue = [makeCard({ status: 'completed' }), makeCard({ status: 'errored' })]
    expect(isUserTurn(queue)).toBe(false)
  })

  it('returns false for an empty queue', () => {
    expect(isUserTurn([])).toBe(false)
  })

  it('correctly reads first waiting even when earlier cards are non-waiting', () => {
    const completed = makeCard({ isUser: false, status: 'completed' })
    const userCard = makeCard({ isUser: true, status: 'waiting' })
    expect(isUserTurn([completed, userCard])).toBe(true)
  })

  it('returns false when first waiting is agent despite user card appearing later', () => {
    const agent = makeCard({ isUser: false, status: 'waiting' })
    const user = makeCard({ isUser: true, status: 'waiting' })
    expect(isUserTurn([agent, user])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getErroredCards
// ---------------------------------------------------------------------------

describe('getErroredCards', () => {
  it('returns only cards with errored status', () => {
    const errored = makeCard({ status: 'errored', errorLabel: 'Timed out' })
    const completed = makeCard({ status: 'completed' })
    const waiting = makeCard({ status: 'waiting' })
    const result = getErroredCards([errored, completed, waiting])
    expect(result).toEqual([errored])
  })

  it('returns empty array when no cards are errored', () => {
    const queue = [makeCard({ status: 'completed' }), makeCard({ status: 'waiting' })]
    expect(getErroredCards(queue)).toEqual([])
  })

  it('returns empty array for an empty queue', () => {
    expect(getErroredCards([])).toEqual([])
  })

  it('returns all errored cards when multiple exist', () => {
    const e1 = makeCard({ status: 'errored' })
    const e2 = makeCard({ status: 'errored' })
    const ok = makeCard({ status: 'completed' })
    const result = getErroredCards([e1, ok, e2])
    expect(result).toEqual([e1, e2])
  })
})

// ---------------------------------------------------------------------------
// getActiveQueueCards
// ---------------------------------------------------------------------------

describe('getActiveQueueCards', () => {
  it('returns all cards that are not errored', () => {
    const errored = makeCard({ status: 'errored' })
    const waiting = makeCard({ status: 'waiting' })
    const completed = makeCard({ status: 'completed' })
    const result = getActiveQueueCards([errored, waiting, completed])
    expect(result).toEqual([waiting, completed])
  })

  it('returns all cards when none are errored', () => {
    const queue = [
      makeCard({ status: 'waiting' }),
      makeCard({ status: 'active' }),
      makeCard({ status: 'completed' }),
      makeCard({ status: 'skipped' }),
    ]
    const result = getActiveQueueCards(queue)
    expect(result).toHaveLength(4)
  })

  it('returns empty array when every card is errored', () => {
    const queue = [makeCard({ status: 'errored' }), makeCard({ status: 'errored' })]
    expect(getActiveQueueCards(queue)).toEqual([])
  })

  it('returns empty array for an empty queue', () => {
    expect(getActiveQueueCards([])).toEqual([])
  })

  it('excludes only errored cards leaving active and skipped intact', () => {
    const active = makeCard({ status: 'active' })
    const errored = makeCard({ status: 'errored' })
    const skipped = makeCard({ status: 'skipped' })
    const result = getActiveQueueCards([active, errored, skipped])
    expect(result).toEqual([active, skipped])
  })
})
