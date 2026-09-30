import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AdvisorWindow } from '@/types'

const streamResponse = vi.fn()
vi.mock('@/services/api/stream-orchestrator', () => ({
  streamResponse: (...args: unknown[]) => streamResponse(...args),
  isTransientError: (statusCode?: number) => statusCode === 503,
}))

const { useStore } = await import('@/store')
const { startRun, handleUserMessage, stopAll, retryAdvisor, dispatchNextTurn } = await import('./turn-dispatcher')
const { createAgentCard } = await import('./queue-builder')
const { isUserTurn } = await import('./turn-engine')

const advisor = (id: string): AdvisorWindow => ({
  id,
  provider: 'claude-subscription',
  keyId: '',
  model: 'claude-haiku-4-5',
  personaId: '',
  personaLabel: `Advisor ${id}`,
  accentColor: '#4A90D9',
  runningCost: 0,
  isStreaming: false,
  streamContent: '',
  error: null,
  isCompacted: false,
  compactedSummary: null,
  bufferSize: 15,
})

function setup(ids: readonly string[]): void {
  useStore.setState({
    windows: Object.fromEntries(ids.map((id) => [id, advisor(id)])),
    windowOrder: [...ids],
    queue: ids.map((id) => createAgentCard(id)),
    turnMode: 'sequential',
    loopCount: 0,
    autoRetryTransient: false,
    isRunning: false,
    isPaused: false,
    activeCardIds: [],
    messages: [],
  })
}

beforeEach(() => {
  stopAll()
  streamResponse.mockReset()
  // Every advisor answers on the next timer tick. A timer (not a microtask)
  // keeps an endless round loop from starving the test's own timers.
  streamResponse.mockImplementation((_config: unknown, callbacks: { onDone: (text: string) => void }) => {
    const controller = new AbortController()
    setTimeout(() => { if (!controller.signal.aborted) callbacks.onDone('reply') }, 1)
    return controller
  })
})

describe('Seq mode with a single AI', () => {
  it('answers once, then waits for the user instead of replying to itself', async () => {
    setup(['a'])
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(1)
    const state = useStore.getState()
    expect(isUserTurn(state.queue)).toBe(true)
    expect(state.queue[0]?.isUser).toBe(true)
  })

  it('answers again only after the user sends another message', async () => {
    setup(['a'])
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    expect(streamResponse).toHaveBeenCalledTimes(1)
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(2)
  })

  it('answers a message sent while the advisor was still replying, then waits again', async () => {
    setup(['a'])
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    handleUserMessage() // sent mid-reply: no user turn is open yet
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(2)
  })

  it('forgets a pending mid-reply message when the run is stopped', async () => {
    setup(['a'])
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    handleUserMessage()
    stopAll()
    startRun()
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(1)
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
  })
})

describe('Seq mode with two AIs', () => {
  it('still lets the advisors continue on unlimited rounds without a user turn', async () => {
    setup(['a', 'b'])
    startRun()
    await vi.waitFor(() => expect(streamResponse.mock.calls.length).toBeGreaterThanOrEqual(4))
    stopAll()
    expect(useStore.getState().queue.some((card) => card.isUser)).toBe(false)
  })
})

type Callbacks = { onDone: (text: string) => void; onError: (error: string) => void }

/** Makes the next `count` advisor calls fail, then answer normally again. */
function failNext(count: number): void {
  let remaining = count
  streamResponse.mockImplementation((_config: unknown, callbacks: Callbacks) => {
    const controller = new AbortController()
    const fail = remaining > 0
    remaining -= 1
    setTimeout(() => {
      if (controller.signal.aborted) return
      if (fail) callbacks.onError('boom')
      else callbacks.onDone('reply')
    }, 1)
    return controller
  })
}

const agentCards = (windowId: string) => useStore.getState().queue.filter((c) => !c.isUser && c.windowId === windowId)

describe('Seq mode with a single AI: errors, retry and round limits', () => {
  it('a retry runs once and leaves the queue, so the advisor still answers once per message', async () => {
    setup(['a'])
    failNext(1)
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['a']?.error).toBe('boom'))
    retryAdvisor('a')
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(agentCards('a')).toHaveLength(1))
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(3)
  })

  it('keeps the advisor and its user turn when it errors under a round limit, so the next message runs it', async () => {
    setup(['a'])
    useStore.setState({ loopCount: 1 })
    failNext(1)
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(useStore.getState().queue.map((c) => [c.isUser, c.status])).toEqual([[true, 'waiting'], [false, 'waiting']])
    expect(useStore.getState().windows['a']?.error).toBe('boom')
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
  })
})

describe('Seq mode with several AIs keeps its previous behaviour', () => {
  it('does not re-answer a message sent mid-round; it waits for the user', async () => {
    setup(['a', 'b'])
    useStore.setState({ queue: [{ id: 'u', windowId: '__user__', isUser: true, status: 'waiting', errorLabel: null }, ...useStore.getState().queue] })
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    handleUserMessage() // sent while a is replying
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(2)
  })
})

describe('round-2 regressions', () => {
  it('a retry keeps the advisor in the rotation when its own card was already dropped', async () => {
    setup(['a', 'b'])
    useStore.setState({ queue: [{ id: 'u', windowId: '__user__', isUser: true, status: 'waiting', errorLabel: null }, ...useStore.getState().queue] })
    failNext(1) // a fails
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['a']?.error).toBe('boom'))
    stopAll()
    // a's card is gone (e.g. the user removed it from the queue).
    useStore.setState({ queue: useStore.getState().queue.filter((c) => c.windowId !== 'a') })
    retryAdvisor('a')
    await vi.waitFor(() => expect(streamResponse.mock.calls.length).toBeGreaterThanOrEqual(2))
    await new Promise((r) => setTimeout(r, 20))
    expect(agentCards('a')).toHaveLength(1)
  })

  it('ends the run instead of looping on an empty queue when no advisor is left', async () => {
    setup(['a'])
    useStore.setState({ loopCount: 0 })
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    // The only advisor's card disappears mid-reply (e.g. the advisor was removed).
    useStore.setState({ queue: useStore.getState().queue.filter((c) => c.isUser) })
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(useStore.getState().queue).toEqual([])
  })

  it('does not reply a second time to messages its waiting card will already see', async () => {
    setup(['a'])
    startRun()
    useStore.setState({ isPaused: true })
    handleUserMessage() // completes the user turn; a is still waiting
    handleUserMessage() // a second message while paused: a's pending reply will see it
    useStore.setState({ isPaused: false })
    dispatchNextTurn()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(1)
  })
})

const userCard = (status: 'waiting' | 'completed' = 'waiting') => ({ id: `u_${status}`, windowId: '__user__', isUser: true, status, errorLabel: null })

describe('round-3 regressions', () => {
  it('a retry replaces the errored card, so the advisor survives Stop and round limits', async () => {
    setup(['a', 'b'])
    useStore.setState({ loopCount: 1, queue: [userCard(), ...useStore.getState().queue] })
    // Call 1 (a) fails at once; call 2 (b) is slow, so the retry happens while b replies.
    let call = 0
    streamResponse.mockImplementation((_config: unknown, callbacks: Callbacks) => {
      const controller = new AbortController()
      call += 1
      const n = call
      setTimeout(() => {
        if (controller.signal.aborted) return
        if (n === 1) callbacks.onError('boom')
        else callbacks.onDone('reply')
      }, n === 2 ? 150 : 1)
      return controller
    })
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['a']?.error).toBe('boom'))
    expect(useStore.getState().isRunning).toBe(true) // b is still replying
    retryAdvisor('a')
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(agentCards('a')).toHaveLength(1)
    expect(agentCards('b')).toHaveLength(1)
    const before = streamResponse.mock.calls.length
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(streamResponse.mock.calls.length - before).toBe(2) // both a and b answer
  })

  it.each([
    ['a completed user turn with the advisor still waiting', 'waiting'],
    ['an advisor saved mid-reply', 'active'],
  ] as const)('a restored queue (%s) answers the next message exactly once', async (_label, advisorStatus) => {
    setup(['a'])
    useStore.setState({ queue: [userCard('completed'), { ...createAgentCard('a'), status: advisorStatus }] })
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(1)
  })

  it('a restored lone retry card becomes the advisor card and waits for the user', async () => {
    setup(['a'])
    useStore.setState({ queue: [{ id: 'retry_from-last-session', windowId: 'a', isUser: false, status: 'active', errorLabel: null }] })
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(streamResponse).toHaveBeenCalledTimes(1)
  })

  it('ends the run when the user answers but no advisor is left', () => {
    setup(['a'])
    startRun()
    // The only advisor is removed while it's the user's turn.
    useStore.setState({ queue: useStore.getState().queue.filter((c) => c.isUser) })
    handleUserMessage()
    expect(useStore.getState().isRunning).toBe(false)
    expect(useStore.getState().queue).toEqual([])
    expect(streamResponse).not.toHaveBeenCalled()
  })
})

type RetryCallbacks = Callbacks & { onError: (error: string, usage?: unknown, statusCode?: number) => void }

/**
 * Call n's outcome and delay (ms): 'busy' is a transient 503 that auto-retry
 * picks up; 'fail' is an ordinary error.
 */
function scriptCalls(plan: (n: number) => { readonly outcome: 'reply' | 'busy' | 'fail'; readonly delay: number }): void {
  let call = 0
  streamResponse.mockImplementation((_config: unknown, callbacks: RetryCallbacks) => {
    const controller = new AbortController()
    call += 1
    const { outcome, delay } = plan(call)
    setTimeout(() => {
      if (controller.signal.aborted) return
      if (outcome === 'busy') callbacks.onError('Service unavailable', undefined, 503)
      else if (outcome === 'fail') callbacks.onError('boom')
      else callbacks.onDone('reply')
    }, delay)
    return controller
  })
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const RETRY_WAIT = { timeout: 3_000 }

describe('round-4 regressions: transient auto-retry', () => {
  it('a message sent mid-reply is answered once by the auto-retry, not again afterwards', async () => {
    setup(['a'])
    useStore.setState({ autoRetryTransient: true })
    scriptCalls((n) => (n === 1 ? { outcome: 'busy', delay: 30 } : { outcome: 'reply', delay: 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    handleUserMessage() // sent while the first attempt is still running
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2), RETRY_WAIT)
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    expect(streamResponse).toHaveBeenCalledTimes(2)
  })

  it('Stop and Start during the wait cancel the pending auto-retry', async () => {
    setup(['a'])
    useStore.setState({ autoRetryTransient: true })
    scriptCalls((n) => (n === 1 ? { outcome: 'busy', delay: 1 } : { outcome: 'reply', delay: 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().queue.some((c) => !c.isUser && c.status === 'waiting')).toBe(true))
    stopAll()
    startRun() // the lone advisor now waits for the user
    await settle(1_200)
    expect(streamResponse).toHaveBeenCalledTimes(1)
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
  })

  it('a card already run by a message sent during the wait is not run again by the timer', async () => {
    setup(['a'])
    useStore.setState({ autoRetryTransient: true })
    scriptCalls((n) => (n === 1 ? { outcome: 'busy', delay: 1 } : { outcome: 'reply', delay: 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().queue.some((c) => !c.isUser && c.status === 'waiting')).toBe(true))
    handleUserMessage() // runs the waiting card now; its round finishes within the wait
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle(1_200)
    expect(streamResponse).toHaveBeenCalledTimes(2)
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
  })
})

describe('round-4 regressions: Retry while stopped', () => {
  it('on the default one-advisor queue, answers once and then waits for the user', async () => {
    setup(['a'])
    useStore.setState({ windows: { a: { ...advisor('a'), error: 'boom' } } })
    retryAdvisor('a')
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    expect(streamResponse).toHaveBeenCalledTimes(1)
    expect(agentCards('a')).toHaveLength(1)
  })

  it.each([
    ['saved mid-reply', 'active'],
    ['saved after an error', 'errored'],
  ] as const)('a restored queue (%s) does not get stuck after the retry', async (_label, advisorStatus) => {
    setup(['a'])
    useStore.setState({ queue: [userCard('completed'), { ...createAgentCard('a'), status: advisorStatus }] })
    retryAdvisor('a')
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    expect(streamResponse).toHaveBeenCalledTimes(2)
    expect(agentCards('a')).toHaveLength(1)
  })

  it('with two advisors, nobody speaks twice in a row after the retry', async () => {
    setup(['a', 'b'])
    useStore.setState({ loopCount: 2, queue: [{ ...createAgentCard('a'), status: 'errored' }, createAgentCard('b')] })
    const speakers: string[] = []
    const unsubscribe = useStore.subscribe((state, prev) => {
      for (const card of state.queue) {
        const before = prev.queue.find((c) => c.id === card.id)
        if (card.status === 'active' && before?.status !== 'active') speakers.push(card.windowId)
      }
    })
    retryAdvisor('a')
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    unsubscribe()
    expect(speakers).toEqual(['a', 'b', 'a', 'b'])
  })
})

/** Records which advisor starts each reply. */
function recordSpeakers(): { readonly speakers: string[]; readonly stop: () => void } {
  const speakers: string[] = []
  const stop = useStore.subscribe((state, prev) => {
    for (const card of state.queue) {
      const before = prev.queue.find((c) => c.id === card.id)
      if (card.status === 'active' && before?.status !== 'active') speakers.push(card.windowId)
    }
  })
  return { speakers, stop }
}

const cardOf = (windowId: string) => useStore.getState().queue.find((c) => !c.isUser && c.windowId === windowId)

describe('round-5 regressions', () => {
  it('skipping a card during its auto-retry wait lets the round carry on', async () => {
    setup(['a', 'b'])
    useStore.setState({ autoRetryTransient: true, queue: [userCard(), ...useStore.getState().queue] })
    scriptCalls((n) => (n === 1 ? { outcome: 'busy', delay: 1 } : { outcome: 'reply', delay: 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(cardOf('a')?.status).toBe('waiting'))
    useStore.getState().skipCard(cardOf('a')?.id ?? '')
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2), RETRY_WAIT) // b answers
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
  })

  it('a removed card\'s auto-retry does not start another advisor while one is replying', async () => {
    setup(['a', 'b', 'c'])
    useStore.setState({ autoRetryTransient: true, queue: [userCard(), ...useStore.getState().queue] })
    scriptCalls((n) => (n === 1 ? { outcome: 'busy', delay: 1 } : { outcome: 'reply', delay: n === 2 ? 1_500 : 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(cardOf('a')?.status).toBe('waiting'))
    useStore.getState().removeFromQueue(cardOf('a')?.id ?? '')
    handleUserMessage() // starts b, which replies slowly
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await settle(1_200) // the auto-retry timer has fired by now
    expect(streamResponse).toHaveBeenCalledTimes(2) // c waits for b
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(3), RETRY_WAIT)
  })

  it('Stop, then Retry while waiting for the user: only the retried advisor answers again', async () => {
    setup(['a', 'b'])
    useStore.setState({ queue: [userCard(), ...useStore.getState().queue] })
    failNext(1) // a fails, b answers; the round resets and waits for the user
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    stopAll()
    const { speakers, stop } = recordSpeakers()
    retryAdvisor('a')
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    stop()
    expect(speakers).toEqual(['a'])
    expect(agentCards('a')).toHaveLength(1)
    expect(agentCards('b')).toHaveLength(1)
  })

  it('a paused auto-retry of a Retry runs after Resume, and the advisor then answers once per message', async () => {
    setup(['a'])
    useStore.setState({ autoRetryTransient: true })
    scriptCalls((n) => (n === 1 ? { outcome: 'fail', delay: 1 } : n === 2 ? { outcome: 'busy', delay: 1 } : { outcome: 'reply', delay: 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['a']?.error).toBe('boom'))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    retryAdvisor('a') // one-shot retry card; its first attempt gets a 503
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(useStore.getState().activeCardIds).toEqual([]))
    useStore.getState().setPaused(true)
    await settle(1_200)
    expect(streamResponse).toHaveBeenCalledTimes(2)
    useStore.getState().setPaused(false)
    dispatchNextTurn() // what Resume does
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(3), RETRY_WAIT)
    await vi.waitFor(() => expect(agentCards('a')).toHaveLength(1))
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(4))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    expect(streamResponse).toHaveBeenCalledTimes(4)
  })
})

describe('round-6 regressions', () => {
  it('a retry pressed after the next message has been sent answers it once', async () => {
    setup(['a', 'b'])
    useStore.setState({ queue: [userCard(), ...useStore.getState().queue] })
    // Round 1: a answers, b fails. Round 2: a replies slowly while b is retried.
    scriptCalls((n) => (n === 2 ? { outcome: 'fail', delay: 1 } : { outcome: 'reply', delay: n === 3 ? 100 : 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['b']?.error).toBe('boom'))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    handleUserMessage() // a starts on the new message
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(3))
    retryAdvisor('b') // b's own turn this round hasn't come yet
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(4))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    expect(streamResponse).toHaveBeenCalledTimes(4)
    expect(agentCards('b')).toHaveLength(1)
  })

  it('a waiting one-shot retry is dropped once the advisor\'s own turn answers the new message', async () => {
    setup(['a'])
    useStore.setState({ autoRetryTransient: true })
    scriptCalls((n) => (n === 1 ? { outcome: 'fail', delay: 1 } : n === 2 ? { outcome: 'busy', delay: 1 } : { outcome: 'reply', delay: 1 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    retryAdvisor('a') // one-shot; its first attempt gets a 503 and waits to retry
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(useStore.getState().activeCardIds).toEqual([]))
    handleUserMessage() // the advisor's own turn answers this message
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle(1_200) // past the dropped retry's timer
    expect(streamResponse).toHaveBeenCalledTimes(3)
    expect(agentCards('a')).toHaveLength(1)
  })

  it('Parallel: an advisor that fails at once does not make another advisor answer twice', async () => {
    setup(['a', 'b'])
    useStore.setState({
      turnMode: 'parallel',
      loopCount: 1,
      keys: [],
      windows: { a: { ...advisor('a'), provider: 'anthropic' }, b: advisor('b') }, // a has no API key
    })
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(streamResponse).toHaveBeenCalledTimes(1) // only b
  })

  it('Queue mode keeps the user turn while every advisor is skipped', async () => {
    setup(['a'])
    const skipped = { ...createAgentCard('a'), status: 'skipped' as const }
    useStore.setState({ turnMode: 'queue', queue: [userCard(), skipped] })
    startRun() // what sending a message does when stopped
    handleUserMessage()
    expect(useStore.getState().isRunning).toBe(false)
    expect(useStore.getState().queue.some((c) => c.isUser)).toBe(true)
    useStore.getState().unskipCard(skipped.id)
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    await settle()
    expect(streamResponse).toHaveBeenCalledTimes(1)
  })
})

describe('rounds in which no advisor replies (missing keys, early failures)', () => {
  const missingKey = (id: string): AdvisorWindow => ({ ...advisor(id), provider: 'anthropic' })

  let stopBreaker: () => void = () => {}
  afterEach(() => stopBreaker())

  /** Stops the run if the dispatcher loops, so a regression fails instead of hanging the test. */
  function breakRunawayLoop(): void {
    const unsubscribe = useStore.subscribe((state) => {
      if (state.errorLog.length <= 20 || !state.isRunning) return
      unsubscribe() // first: stopAll's own store updates would re-enter here
      stopAll()
    })
    stopBreaker = unsubscribe
  }

  it.each(['parallel', 'sequential'] as const)('%s mode ends the run after one failed round instead of looping', async (mode) => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: mode, keys: [], errorLog: [], windows: { a: missingKey('a'), b: missingKey('b') } })
    breakRunawayLoop()
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(useStore.getState().errorLog).toHaveLength(2) // one per advisor
    expect(useStore.getState().windows['a']?.error).toBe('API key not found')
    expect(useStore.getState().queue.map((c) => c.status)).toEqual(['waiting', 'waiting'])
    expect(streamResponse).not.toHaveBeenCalled()
  })

  it('stops when a later round has no reply (keys deleted mid-run)', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'parallel', keys: [], errorLog: [] })
    streamResponse.mockImplementation((_config: unknown, callbacks: Callbacks) => {
      const controller = new AbortController()
      // After round 1 has started both requests, both advisors lose their key.
      if (streamResponse.mock.calls.length === 2) useStore.setState({ windows: { a: missingKey('a'), b: missingKey('b') } })
      setTimeout(() => { if (!controller.signal.aborted) callbacks.onDone('reply') }, 1)
      return controller
    })
    breakRunawayLoop()
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(streamResponse).toHaveBeenCalledTimes(2)
    expect(useStore.getState().errorLog).toHaveLength(2)
  })

  it.each(['parallel', 'sequential'] as const)('%s: requests refused before reaching the network (e.g. an attachment on the subscription) end the run after one round', async (mode) => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: mode, errorLog: [] })
    streamResponse.mockImplementation((_config: unknown, callbacks: Callbacks) => {
      const controller = new AbortController()
      queueMicrotask(() => callbacks.onError('Attachments are not supported'))
      return controller
    })
    breakRunawayLoop()
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(streamResponse).toHaveBeenCalledTimes(2)
    expect(useStore.getState().errorLog).toHaveLength(2)
  })

  it('a round in which every request fails ends the run instead of retrying forever', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'parallel', errorLog: [] })
    failNext(2)
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(streamResponse).toHaveBeenCalledTimes(2)
    expect(useStore.getState().errorLog).toHaveLength(2)
  })

  it('a user turn in the middle of the queue still holds the run, as before', async () => {
    setup(['a', 'b'])
    useStore.setState({
      turnMode: 'queue',
      keys: [],
      errorLog: [],
      windows: { a: missingKey('a'), b: missingKey('b') },
      queue: [createAgentCard('a'), userCard(), createAgentCard('b')],
    })
    breakRunawayLoop()
    startRun() // a fails; the run waits at the user turn
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
    handleUserMessage() // b fails; the next round's a fails; the run waits for the user again
    await settle()
    expect(useStore.getState().isRunning).toBe(true)
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
    expect(useStore.getState().errorLog).toHaveLength(3)
  })

  it('keeps looping while another advisor replies', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'parallel', keys: [], errorLog: [], windows: { a: missingKey('a'), b: advisor('b') } })
    startRun()
    await vi.waitFor(() => expect(streamResponse.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(useStore.getState().isRunning).toBe(true)
    stopAll()
  })

  it('a lone advisor with a user turn still waits for the user after the error', async () => {
    setup(['a'])
    useStore.setState({ keys: [], errorLog: [], windows: { a: missingKey('a') } })
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['a']?.error).toBe('API key not found'))
    await settle()
    expect(useStore.getState().isRunning).toBe(true)
    expect(isUserTurn(useStore.getState().queue)).toBe(true)
    expect(agentCards('a')).toHaveLength(1)
  })
})

describe('errored advisors stay in the rotation', () => {
  it('Stop keeps an advisor whose turn errored', async () => {
    setup(['a', 'b'])
    useStore.setState({ queue: [userCard(), ...useStore.getState().queue] })
    scriptCalls((n) => (n === 1 ? { outcome: 'fail', delay: 1 } : { outcome: 'reply', delay: 200 }))
    startRun()
    handleUserMessage()
    await vi.waitFor(() => expect(useStore.getState().windows['a']?.error).toBe('boom'))
    stopAll() // while b is still replying
    expect(agentCards('a')).toHaveLength(1)
    expect(useStore.getState().queue.map((c) => c.status)).toEqual(['waiting', 'waiting', 'waiting'])
    expect(useStore.getState().windows['a']?.error).toBe('boom')
  })

  it('a finite run whose last round fails keeps its advisors, so Start still works', async () => {
    setup(['a', 'b'])
    useStore.setState({
      turnMode: 'parallel',
      loopCount: 1,
      keys: [],
      windows: { a: { ...advisor('a'), provider: 'anthropic' }, b: { ...advisor('b'), provider: 'anthropic' } },
    })
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(useStore.getState().queue.map((c) => c.status)).toEqual(['waiting', 'waiting'])
  })
})

describe('a request that cannot be set up', () => {
  it('fails only that turn; the other advisors run and nothing stays active', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'parallel', loopCount: 1, errorLog: [] })
    let call = 0
    streamResponse.mockImplementation((_config: unknown, callbacks: Callbacks) => {
      call += 1
      if (call === 1) throw new Error('Custom adapter definition not found')
      const controller = new AbortController()
      setTimeout(() => { if (!controller.signal.aborted) callbacks.onDone('reply') }, 1)
      return controller
    })
    startRun()
    await vi.waitFor(() => expect(useStore.getState().isRunning).toBe(false))
    expect(useStore.getState().windows['a']?.error).toBe('Custom adapter definition not found')
    expect(useStore.getState().windows['a']?.isStreaming).toBe(false)
    expect(useStore.getState().activeCardIds).toEqual([])
    expect(streamResponse).toHaveBeenCalledTimes(2) // b still answered
    expect(useStore.getState().errorLog).toHaveLength(1)
  })
})

describe('rounds that end on the user turn or after a removal', () => {
  const lastUserTurnQueue = () => [createAgentCard('a'), createAgentCard('b'), userCard()]

  it('Queue mode with the user card last: the message ends the round and the next one starts', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'queue', loopCount: 2, queue: lastUserTurnQueue() })
    startRun()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(4)) // round 2
    await vi.waitFor(() => expect(isUserTurn(useStore.getState().queue)).toBe(true))
  })

  it('Parallel mode with a user card: the message ends the round once the advisors are done', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'parallel', loopCount: 2, queue: lastUserTurnQueue() })
    startRun()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(useStore.getState().activeCardIds).toEqual([]))
    handleUserMessage()
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(4))
  })

  it('removing the last waiting card while paused, then resuming, ends the round', async () => {
    setup(['a', 'b'])
    useStore.setState({ turnMode: 'queue', queue: [userCard(), createAgentCard('a'), createAgentCard('b')] })
    scriptCalls(() => ({ outcome: 'reply', delay: 50 }))
    startRun()
    handleUserMessage() // a starts
    await vi.waitFor(() => expect(streamResponse).toHaveBeenCalledTimes(1))
    useStore.getState().setPaused(true)
    await vi.waitFor(() => expect(useStore.getState().activeCardIds).toEqual([])) // a finished while paused
    useStore.getState().removeFromQueue(cardOf('b')?.id ?? '')
    useStore.getState().setPaused(false)
    dispatchNextTurn() // what Resume does
    expect(isUserTurn(useStore.getState().queue)).toBe(true) // the next round waits for the user
    expect(useStore.getState().isRunning).toBe(true)
  })
})
