import { describe, it, expect } from 'vitest'
import type { QueueCard } from '@/types'
import { createAgentCard, createUserCard, ensureUserTurnForSoloAgent, dropOrphanUserTurns, isSoloSequentialQueue, hasActiveAgent, createRetryCard, dropLeftoverRetryCards, resetQueueForNewRun, prepareQueueForRun, queueForRetryFromStop, queueForRetryWhileRunning } from './queue-builder'

const agent = (windowId: string, status: QueueCard['status'] = 'waiting'): QueueCard => ({ ...createAgentCard(windowId), status })
const user = (status: QueueCard['status'] = 'waiting'): QueueCard => ({ ...createUserCard(), status })

describe('ensureUserTurnForSoloAgent', () => {
  it('puts a waiting user turn first when Seq mode has a single AI and no user turn', () => {
    const queue = [agent('a')]
    const result = ensureUserTurnForSoloAgent(queue, 'sequential')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ isUser: true, status: 'waiting' })
    expect(result[1]).toBe(queue[0])
  })

  it('counts the same advisor queued twice as one AI', () => {
    const result = ensureUserTurnForSoloAgent([agent('a'), agent('a')], 'sequential')
    expect(result[0]?.isUser).toBe(true)
    expect(result).toHaveLength(3)
  })

  it('ignores skipped cards when counting AIs and user turns', () => {
    expect(ensureUserTurnForSoloAgent([agent('a'), agent('b', 'skipped')], 'sequential')[0]?.isUser).toBe(true)
    expect(ensureUserTurnForSoloAgent([user('skipped'), agent('a')], 'sequential')[0]?.status).toBe('waiting')
  })

  it('leaves a queue that already has a user turn unchanged', () => {
    const queue = [user(), agent('a')]
    expect(ensureUserTurnForSoloAgent(queue, 'sequential')).toBe(queue)
    const completedUser = [user('completed'), agent('a')]
    expect(ensureUserTurnForSoloAgent(completedUser, 'sequential')).toBe(completedUser)
  })

  it('leaves two or more AIs free to discuss without a user turn', () => {
    const queue = [agent('a'), agent('b')]
    expect(ensureUserTurnForSoloAgent(queue, 'sequential')).toBe(queue)
  })

  it('leaves an empty queue alone', () => {
    const queue: QueueCard[] = []
    expect(ensureUserTurnForSoloAgent(queue, 'sequential')).toBe(queue)
  })

  it.each(['parallel', 'manual', 'queue'] as const)('does not change %s mode', (mode) => {
    const queue = [agent('a')]
    expect(ensureUserTurnForSoloAgent(queue, mode)).toBe(queue)
  })

  it('does not mutate its input', () => {
    const queue = Object.freeze([agent('a')])
    expect(() => ensureUserTurnForSoloAgent(queue, 'sequential')).not.toThrow()
    expect(queue).toHaveLength(1)
  })
})

describe('ensureUserTurnForSoloAgent with advisors that cannot reply', () => {
  it('leaves failing advisors out, so a working one paired only with them still waits for the user', () => {
    const result = ensureUserTurnForSoloAgent([agent('a'), agent('b')], 'sequential', (id) => id !== 'a')
    expect(result.map((c) => (c.isUser ? 'U' : c.windowId))).toEqual(['U', 'a', 'b'])
  })

  it('counts every advisor when none can reply, and ignores the check outside Seq mode', () => {
    const pair = [agent('a'), agent('b')]
    expect(ensureUserTurnForSoloAgent(pair, 'sequential', () => false)).toBe(pair)
    expect(ensureUserTurnForSoloAgent(pair, 'queue', (id) => id !== 'a')).toBe(pair)
  })
})

describe('dropOrphanUserTurns', () => {
  it('removes user turns once no advisor card is left', () => {
    expect(dropOrphanUserTurns([user()])).toEqual([])
  })

  it('keeps the user turn while the advisors are only skipped, for when one is unskipped', () => {
    const queue = [user('completed'), agent('a', 'skipped')]
    expect(dropOrphanUserTurns(queue)).toBe(queue)
  })

  it('keeps the queue when an advisor can still run', () => {
    const queue = [user(), agent('a')]
    expect(dropOrphanUserTurns(queue)).toBe(queue)
  })

  it('returns an already-empty queue unchanged', () => {
    const queue: QueueCard[] = []
    expect(dropOrphanUserTurns(queue)).toBe(queue)
  })
})

describe('isSoloSequentialQueue / hasActiveAgent', () => {
  it('recognises exactly one distinct active AI in Seq mode only', () => {
    expect(isSoloSequentialQueue([user(), agent('a'), agent('a')], 'sequential')).toBe(true)
    expect(isSoloSequentialQueue([agent('a'), agent('b')], 'sequential')).toBe(false)
    expect(isSoloSequentialQueue([agent('a')], 'queue')).toBe(false)
    expect(isSoloSequentialQueue([user()], 'sequential')).toBe(false)
  })

  it('reports whether any advisor card can still run', () => {
    expect(hasActiveAgent([user()])).toBe(false)
    expect(hasActiveAgent([agent('a', 'skipped')])).toBe(false)
    expect(hasActiveAgent([agent('a', 'errored')])).toBe(true)
  })
})

describe('dropLeftoverRetryCards', () => {
  it('drops a restored retry card when the advisor has its own card', () => {
    const own = agent('a')
    const queue = [user(), own, createRetryCard('a')]
    expect(dropLeftoverRetryCards(queue, () => false)).toEqual([queue[0], own])
  })

  it('keeps a retry card created in this app session even if the advisor has another card', () => {
    const queue = [user(), agent('a'), createRetryCard('a')]
    expect(dropLeftoverRetryCards(queue, () => true)).toBe(queue)
  })

  it("keeps a retry card that has become the advisor's only card", () => {
    const queue = [user(), createRetryCard('a')]
    expect(dropLeftoverRetryCards(queue, () => false)).toBe(queue)
  })
})

describe('resetQueueForNewRun', () => {
  it('makes errored, finished or in-progress cards wait again and keeps skipped ones', () => {
    const skipped = agent('b', 'skipped')
    const result = resetQueueForNewRun([user('completed'), agent('a', 'active'), agent('c', 'errored'), skipped, agent('d', 'completed')])
    expect(result.map((c) => c.status)).toEqual(['waiting', 'waiting', 'waiting', 'skipped', 'waiting'])
    expect(result.every((c) => c.errorLabel === null)).toBe(true)
    expect(result[3]).toBe(skipped)
  })

  it('returns untouched waiting cards as they are', () => {
    const waiting = agent('a')
    expect(resetQueueForNewRun([waiting])[0]).toBe(waiting)
  })
})

describe('prepareQueueForRun', () => {
  it('resets statuses and adds the user turn for a lone AI in Seq mode', () => {
    const result = prepareQueueForRun([agent('a', 'active')], 'sequential', () => false)
    expect(result.map((c) => [c.isUser, c.status])).toEqual([[true, 'waiting'], [false, 'waiting']])
  })

  it('keeps an errored advisor, waiting again, and drops a user turn with no advisor card', () => {
    const kept = prepareQueueForRun([user('completed'), agent('a', 'errored')], 'sequential', () => false)
    expect(kept.map((c) => [c.isUser, c.status])).toEqual([[true, 'waiting'], [false, 'waiting']])
    expect(prepareQueueForRun([user('completed')], 'sequential', () => false)).toEqual([])
  })
})

describe('queueForRetryFromStop', () => {
  const shape = (queue: readonly QueueCard[]) => queue.map((c) => `${c.isUser ? 'U' : c.windowId}${c.id.startsWith('retry_') ? '*' : ''}:${c.status}`)

  it('when the advisor still has a card, adds the retry as a one-shot extra turn after Start\'s clean-up', () => {
    const lone = queueForRetryFromStop([agent('a')], createRetryCard('a'), 'sequential', () => true)
    expect(lone.oneShot).toBe(true)
    expect(shape(lone.queue)).toEqual(['U:waiting', 'a:waiting', 'a*:waiting'])
    // A round that had already reset (waiting for the user): the others don't answer again.
    const reset = queueForRetryFromStop([user(), agent('a'), agent('b')], createRetryCard('a'), 'sequential', () => true)
    expect(shape(reset.queue)).toEqual(['U:waiting', 'a:waiting', 'b:waiting', 'a*:waiting'])
    // A restored mid-reply card is reset, not left "active".
    const restored = queueForRetryFromStop([user('completed'), agent('a', 'active')], createRetryCard('a'), 'sequential', () => true)
    expect(shape(restored.queue)).toEqual(['U:waiting', 'a:waiting', 'a*:waiting'])
  })

  it("keeps turns the user gave the advisor, and drops only a leftover retry card", () => {
    const next = queueForRetryFromStop([user(), agent('a'), agent('b'), agent('a'), createRetryCard('a')], createRetryCard('a'), 'queue', () => false)
    expect(shape(next.queue)).toEqual(['U:waiting', 'a:waiting', 'b:waiting', 'a:waiting', 'a*:waiting'])
  })

  it('replaces an errored card in place and resumes the round there', () => {
    const solo = queueForRetryFromStop([user('completed'), agent('a', 'errored')], createRetryCard('a'), 'sequential', () => true)
    expect(solo.oneShot).toBe(false)
    expect(shape(solo.queue)).toEqual(['U:completed', 'a*:waiting'])
    const several = queueForRetryFromStop([user(), agent('a'), agent('b', 'errored'), agent('c')], createRetryCard('b'), 'queue', () => true)
    expect(shape(several.queue)).toEqual(['U:completed', 'a:completed', 'b*:waiting', 'c:waiting'])
  })

  it('appends the retry when the advisor has no card left', () => {
    const next = queueForRetryFromStop([user(), agent('b')], createRetryCard('a'), 'sequential', () => true)
    expect(next.oneShot).toBe(false)
    expect(shape(next.queue)).toEqual(['U:completed', 'b:completed', 'a*:waiting'])
  })

  it('in Parallel mode, only the retry runs when resuming, whatever the card order', () => {
    expect(shape(queueForRetryFromStop([agent('a', 'errored'), agent('b'), agent('c')], createRetryCard('a'), 'parallel', () => true).queue))
      .toEqual(['a*:waiting', 'b:completed', 'c:completed'])
    expect(shape(queueForRetryFromStop([agent('a'), agent('c')], createRetryCard('b'), 'parallel', () => true).queue))
      .toEqual(['a:completed', 'c:completed', 'b*:waiting'])
  })

  it('takes the advisor\'s turn and resumes there when no user turn comes before it', () => {
    const first = queueForRetryFromStop([agent('a'), agent('b')], createRetryCard('a'), 'sequential', () => true)
    expect(first.oneShot).toBe(false)
    expect(shape(first.queue)).toEqual(['a*:waiting', 'b:waiting'])
    expect(shape(queueForRetryFromStop([agent('a'), agent('b')], createRetryCard('b'), 'sequential', () => true).queue))
      .toEqual(['a:completed', 'b*:waiting'])
    expect(shape(queueForRetryFromStop([agent('a'), agent('b')], createRetryCard('a'), 'parallel', () => true).queue))
      .toEqual(['a*:waiting', 'b:completed'])
  })

  it('does not mark earlier turns as taken in Manual mode', () => {
    const next = queueForRetryFromStop([user(), agent('a'), agent('b', 'errored')], createRetryCard('b'), 'manual', () => true)
    expect(shape(next.queue)).toEqual(['U:waiting', 'a:waiting', 'b*:waiting'])
  })

  it('does not mutate its input', () => {
    const queue = [user('completed'), agent('a', 'errored')]
    const copy = structuredClone(queue)
    queueForRetryFromStop(queue, createRetryCard('a'), 'sequential', () => true)
    expect(queue).toEqual(copy)
  })
})

describe('queueForRetryWhileRunning', () => {
  const shape = (queue: readonly QueueCard[]) => queue.map((c) => `${c.isUser ? 'U' : c.windowId}${c.id.startsWith('retry_') ? '*' : ''}:${c.status}`)

  it('replaces an errored card in place', () => {
    const next = queueForRetryWhileRunning([user('completed'), agent('a', 'errored'), agent('b', 'active')], createRetryCard('a'))
    expect(next.oneShot).toBe(false)
    expect(shape(next.queue)).toEqual(['U:completed', 'a*:waiting', 'b:active'])
  })

  it('takes the advisor\'s own turn when it would otherwise answer the same messages again', () => {
    const next = queueForRetryWhileRunning([user('completed'), agent('a', 'active'), agent('b')], createRetryCard('b'))
    expect(next.oneShot).toBe(false)
    expect(shape(next.queue)).toEqual(['U:completed', 'a:active', 'b*:waiting'])
  })

  it('adds a one-shot turn when the advisor\'s own turn waits for the user or already ran', () => {
    const behindUser = queueForRetryWhileRunning([user(), agent('a')], createRetryCard('a'))
    expect(behindUser.oneShot).toBe(true)
    expect(shape(behindUser.queue)).toEqual(['U:waiting', 'a:waiting', 'a*:waiting'])
    const alreadyRan = queueForRetryWhileRunning([user('completed'), agent('a', 'completed'), agent('b', 'active')], createRetryCard('a'))
    expect(alreadyRan.oneShot).toBe(true)
  })

  it('makes the retry the advisor\'s card when it has none left', () => {
    const next = queueForRetryWhileRunning([user('completed'), agent('b', 'active')], createRetryCard('a'))
    expect(next.oneShot).toBe(false)
    expect(shape(next.queue)).toEqual(['U:completed', 'b:active', 'a*:waiting'])
  })
})
