import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import type { AdvisorWindow } from '@/types'
import { streamResponse, type StreamCallbacks } from '@/services/api/stream-orchestrator'
import { cancelExchange, executeAgentExchange } from './agent-exchange'

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
    if (config.provider === 'claude-subscription') {
      controller.signal.addEventListener('abort', () => callbacks.onError('Cancelled'), { once: true })
    }
    requests.push({ controller, callbacks })
    return controller
  })
})

afterEach(() => {
  cancelExchange()
  useStore.setState(initial)
})

describe('exchange cancellation', () => {
  it.each(['openai', 'claude-subscription'] as const)('settles %s cancellation without starting another round', async (provider) => {
    useStore.setState({ windows: { w1: { ...advisor, provider } } })
    let settled = false
    const exchange = executeAgentExchange('@Reviewer comment', 2).finally(() => { settled = true })
    cancelExchange()
    expect(requests[0]!.controller.signal.aborted).toBe(true)
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
    await exchange
    expect(streamResponse).toHaveBeenCalledTimes(1)
    expect(useStore.getState().windows['w1']!.isStreaming).toBe(false)
  })

  it('ignores late callbacks without writing to or untracking the replacement request', async () => {
    const oldExchange = executeAgentExchange('@Reviewer old question')
    const old = requests[0]!
    cancelExchange()
    useStore.setState({ windows: { w1: advisor }, messages: [] })
    let settled = false
    const currentExchange = executeAgentExchange('@Reviewer new question').finally(() => { settled = true })
    const current = useStore.getState()
    old.callbacks.onChunk('late chunk')
    old.callbacks.onDone('stale answer')
    old.callbacks.onError('late error')
    old.callbacks.onStale?.()
    expect(useStore.getState().windows).toEqual(current.windows)
    expect(useStore.getState().messages).toEqual(current.messages)

    cancelExchange()
    expect(requests[1]!.controller.signal.aborted).toBe(true)
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
    await Promise.all([oldExchange, currentExchange])
  })

  it('accepts a terminal callback only once', async () => {
    const exchange = executeAgentExchange('@Reviewer comment')
    requests[0]!.callbacks.onDone('First response')
    requests[0]!.callbacks.onDone('Duplicate response')
    requests[0]!.callbacks.onError('late error')
    await exchange
    expect(useStore.getState().messages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(useStore.getState().windows['w1']!.error).toBeNull()
  })

  it('cleans up a synchronous startup failure', async () => {
    vi.mocked(streamResponse).mockImplementation(() => { throw new Error('Unsupported provider') })
    await expect(executeAgentExchange('@Reviewer comment')).resolves.toBeUndefined()
    expect(useStore.getState().windows['w1']).toMatchObject({ isStreaming: false, error: 'Unsupported provider' })
  })
})
