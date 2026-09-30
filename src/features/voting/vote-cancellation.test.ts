import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import type { AdvisorWindow } from '@/types'
import { streamResponse, type StreamCallbacks } from '@/services/api/stream-orchestrator'
import { callForVote, cancelActiveVotes, VoteInProgressError } from './vote-service'

vi.mock('@/services/api/stream-orchestrator', () => ({ streamResponse: vi.fn() }))
vi.mock('@/features/keys/key-vault', () => ({ getRawKey: () => 'test-key' }))

const initial = useStore.getState()
const advisor: AdvisorWindow = {
  id: 'w1', provider: 'openai', keyId: 'key', model: 'test-model',
  personaId: '', personaLabel: 'Reviewer', accentColor: '#123456',
  runningCost: 0, isStreaming: false, streamContent: '', error: null,
  isCompacted: false, compactedSummary: null, bufferSize: 15,
}
const requests: Array<{ controller: AbortController; callbacks: StreamCallbacks }> = []

beforeEach(() => {
  useStore.setState({ ...initial, windows: { w1: advisor }, windowOrder: ['w1'], keys: [
    { id: 'key', provider: 'openai', maskedKey: 'test', createdAt: 0, verified: true },
  ] })
  requests.length = 0
  vi.mocked(streamResponse).mockReset().mockImplementation((config, callbacks) => {
    const controller = new AbortController()
    config.signal?.addEventListener('abort', () => controller.abort(), { once: true })
    // HTTP before response headers emits no callback on abort. The local client does.
    if (config.provider === 'claude-subscription') {
      controller.signal.addEventListener('abort', () => callbacks.onError('Cancelled'), { once: true })
    }
    requests.push({ controller, callbacks })
    return controller
  })
})

afterEach(() => {
  cancelActiveVotes()
  vi.unstubAllGlobals()
  useStore.setState(initial)
})

describe('vote cancellation', () => {
  it('settles through the real HTTP transport when fetch is aborted before headers', async () => {
    const actual = await vi.importActual<typeof import('@/services/api/stream-orchestrator')>(
      '@/services/api/stream-orchestrator',
    )
    vi.mocked(streamResponse).mockImplementation(actual.streamResponse)
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    let settled = false
    const vote = callForVote('Ship?').finally(() => { settled = true })
    expect(fetchMock).toHaveBeenCalledOnce()
    cancelActiveVotes()
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
    await expect(vote).resolves.toMatchObject({ total: 0 })
  })

  it('settles a silent HTTP vote and a mixed HTTP/subscription vote', async () => {
    const subscription = { ...advisor, id: 'w2', provider: 'claude-subscription' as const, keyId: '' }
    useStore.setState({ windows: { w1: advisor, w2: subscription }, windowOrder: ['w1', 'w2'] })
    let settled = false
    const vote = callForVote('Ship?').then((result) => { settled = true; return result })
    cancelActiveVotes()

    expect(requests.every((r) => r.controller.signal.aborted)).toBe(true)
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
    await expect(vote).resolves.toMatchObject({ total: 0 })
  })

  it('ignores every late callback after cancellation into a replacement conversation', async () => {
    const vote = callForVote('Old question')
    const old = requests[0]!
    cancelActiveVotes()
    useStore.setState({ windows: { w1: { ...advisor, streamContent: 'new reply' } }, messages: [] })
    const replacement = useStore.getState()

    old.callbacks.onChunk('late chunk')
    old.callbacks.onDone('YAY: stale answer')
    old.callbacks.onError('late error')
    old.callbacks.onStale?.()

    expect(useStore.getState().windows).toEqual(replacement.windows)
    expect(useStore.getState().messages).toEqual(replacement.messages)
    await expect(vote).resolves.toMatchObject({ total: 0 })
  })

  it('keeps the new vote locked when an older cancelled vote finishes', async () => {
    const old = callForVote('Old question')
    cancelActiveVotes()
    const current = callForVote('Current question')
    // Release the old transport too: even transports that call back must preserve the new lock.
    requests[0]!.callbacks.onError('Cancelled')
    await old

    await expect(callForVote('Third question')).rejects.toBeInstanceOf(VoteInProgressError)
    requests[1]!.callbacks.onDone('YAY: proceed')
    await expect(current).resolves.toMatchObject({ yay: 1, total: 1 })
  })

  it('accepts a terminal callback once and does not retain a synchronously completed controller', async () => {
    const normal = vi.mocked(streamResponse).getMockImplementation()!
    vi.mocked(streamResponse).mockImplementation((config, callbacks) => {
      const controller = normal(config, callbacks)
      callbacks.onDone('YAY: proceed')
      callbacks.onDone('NAY: duplicate')
      callbacks.onError('late error')
      return controller
    })
    await expect(callForVote('Ship?')).resolves.toMatchObject({ yay: 1, total: 1 })
    expect(useStore.getState().messages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(useStore.getState().windows['w1']!.error).toBeNull()
    cancelActiveVotes()
    expect(requests[0]!.controller.signal.aborted).toBe(false)
  })

  it('does not start a request if cancellation happens as streaming state is announced', async () => {
    const unsubscribe = useStore.subscribe((state) => {
      if (state.windows['w1']?.isStreaming) cancelActiveVotes()
    })
    try {
      let settled = false
      const vote = callForVote('Ship?').finally(() => { settled = true })
      expect(streamResponse).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
      await vote
    } finally {
      unsubscribe()
    }
  })
})
