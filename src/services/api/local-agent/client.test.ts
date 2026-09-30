import { describe, it, expect, vi } from 'vitest'
import type { LocalAgentEvent, LocalAgentTurnRequest } from '../../../../shared/local-agent/protocol'
import type { ApiRequestConfig } from '../types'
import { streamLocalAgent, type LocalAgentBridge, type SessionSnapshot } from './client'

const config: ApiRequestConfig = {
  provider: 'claude-subscription',
  model: 'claude-opus-5-5',
  apiKey: '',
  systemPrompt: 'You are the Skeptic.',
  messages: [{ role: 'user', content: '[You]: Ship Friday?' }],
}

type StartResult = { ok: true } | { ok: false; code: string; message: string }
type StartSettler = { resolve: (r: StartResult) => void; reject: (e: unknown) => void }

function setup(options: { startResult?: StartResult; deferStart?: boolean } = {}) {
  let settleStart: StartSettler | null = null
  let listener: ((event: LocalAgentEvent) => void) | null = null
  const started: LocalAgentTurnRequest[] = []
  const bridge: LocalAgentBridge = {
    localAgentStart: vi.fn((request: LocalAgentTurnRequest) => {
      started.push(request)
      if (options.deferStart === true) {
        return new Promise<StartResult>((resolve, reject) => { settleStart = { resolve, reject } })
      }
      return Promise.resolve(options.startResult ?? { ok: true as const })
    }),
    localAgentCancel: vi.fn(async () => true),
    onLocalAgentEvent: vi.fn((cb) => { listener = cb; return () => { listener = null } }),
  }
  let session: SessionSnapshot = { sessionId: 's1', generation: 4 }
  const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onStale: vi.fn() }
  const deps = { bridge, captureSession: () => session, newRequestId: () => 'req-1' }
  const send = (event: Record<string, unknown>) =>
    listener?.({ requestId: 'req-1', ...event } as unknown as LocalAgentEvent)
  return {
    bridge, callbacks, deps, started, send,
    setSession: (next: SessionSnapshot) => { session = next },
    subscribed: () => listener !== null,
    startSettler: (): StartSettler => settleStart!,
  }
}

describe('streamLocalAgent', () => {
  it('sends a runtime request with the captured session and no API key', async () => {
    const { callbacks, deps, started } = setup()
    streamLocalAgent(config, callbacks, deps)
    await vi.waitFor(() => expect(started).toHaveLength(1))
    expect(started[0]).toEqual({
      requestId: 'req-1', sessionId: 's1', generation: 4, runtime: 'claude-code', model: 'claude-opus-5-5',
      systemPrompt: 'You are the Skeptic.', messages: [{ role: 'user', content: '[You]: Ship Friday?' }],
    })
    expect(JSON.stringify(started[0])).not.toContain('apiKey')
  })

  it('streams chunks and completes with token usage', () => {
    const { callbacks, deps, send, subscribed } = setup()
    streamLocalAgent(config, callbacks, deps)
    send({ seq: 0, type: 'text', text: 'Wait ' })
    send({ seq: 1, type: 'text', text: 'for QA.' })
    send({ seq: 2, type: 'completed', usage: { billing: 'subscription', source: 'runtime-reported', inputTokens: 100, outputTokens: 5 } })
    expect(callbacks.onChunk.mock.calls).toEqual([['Wait '], ['for QA.']])
    expect(callbacks.onDone).toHaveBeenCalledWith('Wait for QA.', { inputTokens: 100, outputTokens: 5 })
    expect(subscribed()).toBe(false)
  })

  it('ignores other requests, duplicates, and anything after the terminal event', () => {
    const { callbacks, deps, send } = setup()
    streamLocalAgent(config, callbacks, deps)
    send({ requestId: 'someone-else', seq: 0, type: 'text', text: 'nope' })
    send({ seq: 0, type: 'text', text: 'a' })
    send({ seq: 0, type: 'text', text: 'a' })
    send({ seq: 1, type: 'error', code: 'signed-out', message: 'Signed out', retryable: false })
    send({ seq: 2, type: 'completed' })
    expect(callbacks.onChunk).toHaveBeenCalledTimes(1)
    expect(callbacks.onError).toHaveBeenCalledWith('Signed out', undefined)
    expect(callbacks.onDone).not.toHaveBeenCalled()
  })

  it('reports a stale turn once through onStale, cancels it, and writes nothing when the generation changed', () => {
    const { callbacks, deps, send, setSession, bridge } = setup()
    streamLocalAgent(config, callbacks, deps)
    setSession({ sessionId: 's1', generation: 5 })
    send({ seq: 0, type: 'text', text: 'stale' })
    send({ seq: 1, type: 'completed' })
    expect(callbacks.onChunk).not.toHaveBeenCalled()
    expect(callbacks.onDone).not.toHaveBeenCalled()
    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(callbacks.onStale).toHaveBeenCalledTimes(1)
    expect(bridge.localAgentCancel).toHaveBeenCalledWith('req-1')
  })

  it('treats an unsaved conversation receiving its first ID mid-turn as the same conversation', () => {
    const { callbacks, deps, send, setSession } = setup()
    setSession({ sessionId: null, generation: 4 })
    streamLocalAgent(config, callbacks, deps)
    setSession({ sessionId: 'new-id', generation: 4 })
    send({ seq: 0, type: 'text', text: 'ok' })
    send({ seq: 1, type: 'completed' })
    expect(callbacks.onDone).toHaveBeenCalledWith('ok', undefined)
    expect(callbacks.onStale).not.toHaveBeenCalled()
  })

  it.each([
    ['resolves { ok: false }', (s: StartSettler) => s.resolve({ ok: false, code: 'not-ready', message: 'old error' })],
    ['rejects', (s: StartSettler) => s.reject(new Error('ipc gone'))],
  ])('does not deliver a start failure after the generation changed (start %s)', async (_label, fail) => {
    const { callbacks, deps, setSession, startSettler } = setup({ deferStart: true })
    streamLocalAgent(config, callbacks, deps)
    setSession({ sessionId: 's1', generation: 5 })
    fail(startSettler())
    await vi.waitFor(() => expect(callbacks.onStale).toHaveBeenCalledTimes(1))
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('cancels in main when aborted and settles the caller exactly once, after the abort', async () => {
    const { callbacks, deps, send, bridge } = setup()
    const controller = streamLocalAgent(config, callbacks, deps)
    send({ seq: 0, type: 'text', text: 'partial' })
    controller.abort()
    send({ seq: 1, type: 'cancelled' })
    expect(bridge.localAgentCancel).toHaveBeenCalledWith('req-1')
    // Callers (votes, exchanges) settle their promises from a callback and check abort first.
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1))
    expect(controller.signal.aborted).toBe(true)
    expect(callbacks.onDone).not.toHaveBeenCalled()
    expect(callbacks.onStale).not.toHaveBeenCalled()
  })

  it('links an external abort signal', () => {
    const { callbacks, deps, bridge } = setup()
    const external = new AbortController()
    streamLocalAgent({ ...config, signal: external.signal }, callbacks, deps)
    external.abort()
    expect(bridge.localAgentCancel).toHaveBeenCalledWith('req-1')
  })

  it('reports a rejected start', async () => {
    const { callbacks, deps } = setup({ startResult: { ok: false, code: 'invalid-request', message: 'Invalid model' } })
    streamLocalAgent(config, callbacks, deps)
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith('Invalid model'))
  })

  it('reports that the desktop app is required when there is no bridge', async () => {
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
    streamLocalAgent(config, callbacks, { bridge: null, captureSession: () => ({ sessionId: null, generation: 0 }), newRequestId: () => 'x' })
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('desktop app')))
  })

  it('settles a missing-bridge failure as a cancellation when aborted immediately', async () => {
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
    const controller = streamLocalAgent(config, callbacks, { bridge: null, captureSession: () => ({ sessionId: null, generation: 0 }), newRequestId: () => 'x' })
    controller.abort()
    await new Promise((r) => setTimeout(r, 0))
    expect(callbacks.onError).toHaveBeenCalledTimes(1)
    expect(callbacks.onError).not.toHaveBeenCalledWith(expect.stringContaining('desktop app'))
  })

  it('rejects attachments with a user-facing error and never starts the runtime', async () => {
    const { callbacks, deps, bridge } = setup()
    streamLocalAgent({
      ...config,
      messages: [{
        role: 'user', content: '[You]: See attached',
        attachments: [{ id: 'b', name: 'chart.png', mimeType: 'image/png', data: 'AAAA', type: 'image', sizeBytes: 4 }],
      }],
    }, callbacks, deps)
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('attachments')))
    expect(bridge.localAgentStart).not.toHaveBeenCalled()
  })
})
