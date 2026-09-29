import { describe, it, expect } from 'vitest'
import { parseTurnRequest, isTerminalEvent, LOCAL_AGENT_CHANNELS } from './protocol'

const valid = {
  requestId: 'req-1',
  sessionId: 'session-1',
  generation: 3,
  runtime: 'claude-code',
  model: 'claude-opus-5-5',
  systemPrompt: 'You are an advisor.',
  messages: [
    { role: 'user', content: '[You]: What should we do?' },
    { role: 'assistant', content: 'Consider the options.' },
  ],
}

describe('parseTurnRequest', () => {
  it('accepts a well-formed request and returns a frozen copy', () => {
    const result = parseTurnRequest(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request).toEqual(valid)
    expect(Object.isFrozen(result.request)).toBe(true)
    expect(Object.isFrozen(result.request.messages)).toBe(true)
  })

  it('drops unknown fields instead of passing them through', () => {
    const result = parseTurnRequest({ ...valid, apiKey: 'sk-should-not-cross' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('apiKey' in result.request).toBe(false)
  })

  it.each([
    ['non-object', 'nope'],
    ['empty requestId', { ...valid, requestId: '' }],
    ['overlong requestId', { ...valid, requestId: 'x'.repeat(200) }],
    ['missing sessionId', { ...valid, sessionId: undefined }],
    ['negative generation', { ...valid, generation: -1 }],
    ['fractional generation', { ...valid, generation: 1.5 }],
    ['unknown runtime', { ...valid, runtime: 'some-other-cli' }],
    ['model with whitespace', { ...valid, model: 'opus --tools default' }],
    ['model starting with a dash', { ...valid, model: '-p' }],
    ['non-string systemPrompt', { ...valid, systemPrompt: 42 }],
    ['empty messages', { ...valid, messages: [] }],
    ['bad role', { ...valid, messages: [{ role: 'system', content: 'x' }] }],
    ['non-string content', { ...valid, messages: [{ role: 'user', content: null }] }],
    ['attachments', { ...valid, messages: [{ role: 'user', content: 'x', attachments: [{}] }] }],
    ['oversized transcript', { ...valid, messages: [{ role: 'user', content: 'x'.repeat(8_000_001) }] }],
  ])('rejects %s', (_label, input) => {
    expect(parseTurnRequest(input).ok).toBe(false)
  })

  it('reports unsupported-input for attachments so the caller can explain it', () => {
    const result = parseTurnRequest({ ...valid, messages: [{ role: 'user', content: 'x', attachments: [{ id: 'a' }] }] })
    expect(result).toMatchObject({ ok: false, code: 'unsupported-input' })
  })
})

describe('isTerminalEvent', () => {
  it('treats completed, cancelled and error as terminal and text as not', () => {
    expect(isTerminalEvent({ requestId: 'r', seq: 0, type: 'text', text: 'hi' })).toBe(false)
    expect(isTerminalEvent({ requestId: 'r', seq: 1, type: 'completed' })).toBe(true)
    expect(isTerminalEvent({ requestId: 'r', seq: 1, type: 'cancelled' })).toBe(true)
    expect(isTerminalEvent({ requestId: 'r', seq: 1, type: 'error', code: 'unknown', message: 'x', retryable: false })).toBe(true)
  })
})

describe('LOCAL_AGENT_CHANNELS', () => {
  it('uses one namespaced channel per operation', () => {
    const names = Object.values(LOCAL_AGENT_CHANNELS)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name.startsWith('local-agent:')).toBe(true)
  })
})
