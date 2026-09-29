import { describe, it, expect } from 'vitest'
import { createStreamParser } from './stream-parser'

const init = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  type: 'system', subtype: 'init', session_id: 's', tools: [], mcp_servers: [], apiKeySource: 'none',
  model: 'claude-haiku-4-5-20251001', memory_paths: { auto: 'C:\\tmp\\probe\\memory\\' }, ...overrides,
})
const delta = (text: string): string => JSON.stringify({
  type: 'stream_event', session_id: 's',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
})
const assistant = (text: string, extra: Record<string, unknown> = {}): string => JSON.stringify({
  type: 'assistant', session_id: 's', message: { role: 'assistant', content: [{ type: 'text', text }] }, ...extra,
})
const usage = { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 42 }
const result = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, result: 'Hello there', usage, total_cost_usd: 0.0123, ...overrides,
})

function run(lines: readonly string[]) {
  const parser = createStreamParser()
  const texts: string[] = []
  for (const line of lines) {
    for (const out of parser.push(line)) if (out.kind === 'text') texts.push(out.text)
  }
  return { texts, outcome: parser.outcome() }
}

describe('stream parser', () => {
  it('streams text deltas and reports success with subscription usage (never a dollar cost)', () => {
    const { texts, outcome } = run([init(), delta('Hello'), delta(' there'), assistant('Hello there'), result()])
    expect(texts).toEqual(['Hello', ' there'])
    expect(outcome).toEqual({
      kind: 'success',
      usage: {
        billing: 'subscription', source: 'runtime-reported',
        inputTokens: 3210, outputTokens: 42, cacheReadTokens: 3000, cacheWriteTokens: 200,
      },
    })
    expect(JSON.stringify(outcome)).not.toContain('0.0123')
  })

  it('falls back to the assistant message text when no deltas arrived, without duplicating', () => {
    const { texts } = run([init(), assistant('Whole reply'), result()])
    expect(texts).toEqual(['Whole reply'])
  })

  it('treats subtype "success" with is_error true as an error (observed live)', () => {
    const { outcome } = run([
      init(),
      assistant('Failed to authenticate', { error: 'authentication_failed', is_api_error_message: true }),
      result({ is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', usage: { input_tokens: 0, output_tokens: 0 } }),
    ])
    expect(outcome).toMatchObject({ kind: 'error', code: 'signed-out', retryable: false })
  })

  it('does not stream API error text as advisor content', () => {
    const { texts } = run([init(), assistant('Failed to authenticate', { error: 'authentication_failed' }), result({ is_error: true })])
    expect(texts).toEqual([])
  })

  it('maps rate limiting to a retryable error', () => {
    const { outcome } = run([init(), assistant('limit', { error: 'rate_limit' }), result({ is_error: true, result: 'Claude usage limit reached' })])
    expect(outcome).toMatchObject({ kind: 'error', code: 'rate-limited', retryable: true })
  })

  it('keeps known usage on the error path', () => {
    const { outcome } = run([init(), delta('partial'), result({ is_error: true, result: 'Something broke' })])
    expect(outcome).toMatchObject({ kind: 'error', code: 'unknown', usage: { outputTokens: 42 } })
  })

  it.each([
    ['tools enabled', { tools: ['Bash'] }],
    ['MCP servers loaded', { mcp_servers: [{ name: 'x', status: 'connected' }] }],
    ['API key in use', { apiKeySource: 'ANTHROPIC_API_KEY' }],
    ['apiKeySource missing', { apiKeySource: undefined }],
  ])('fails closed when init shows %s, and streams nothing after it', (_label, overrides) => {
    const { texts, outcome } = run([init(overrides), delta('leaked'), result()])
    expect(texts).toEqual([])
    expect(outcome).toMatchObject({ kind: 'error', code: 'isolation-failed' })
  })

  it('fails closed when text arrives before a verified init', () => {
    const { texts, outcome } = run([delta('too early'), result()])
    expect(texts).toEqual([])
    expect(outcome).toMatchObject({ kind: 'error', code: 'isolation-failed' })
  })

  it('reports a protocol error when the stream ends without a result', () => {
    expect(run([init(), delta('cut off')]).outcome).toMatchObject({ kind: 'error', code: 'protocol' })
    expect(run([]).outcome).toMatchObject({ kind: 'error', code: 'protocol' })
  })

  it('requires a verified init before reporting success', () => {
    expect(run([result()]).outcome).toMatchObject({ kind: 'error', code: 'protocol' })
  })

  it.each([
    ['missing', { is_error: undefined }],
    ['non-boolean', { is_error: 'false' }],
  ])('treats a %s is_error flag as a protocol error, never success', (_label, overrides) => {
    expect(run([init(), delta('x'), result(overrides)]).outcome).toMatchObject({ kind: 'error', code: 'protocol' })
  })

  it('signals isolation failure as soon as init is rejected', () => {
    const parser = createStreamParser()
    expect(parser.push(init({ tools: ['Bash'] }))).toEqual([{ kind: 'fatal', message: expect.stringContaining('tools') }])
    expect(parser.push(delta('after'))).toEqual([])
  })

  it('keeps missing usage counters unknown instead of reporting zeros', () => {
    const { outcome } = run([init(), delta('x'), result({ usage: {} })])
    expect(outcome).toEqual({ kind: 'success' })
  })

  it('reports output tokens but no input total when cache components are missing', () => {
    const { outcome } = run([init(), delta('x'), result({ usage: { input_tokens: 10, output_tokens: 3 } })])
    expect(outcome).toEqual({
      kind: 'success',
      usage: { billing: 'subscription', source: 'runtime-reported', outputTokens: 3 },
    })
  })

  it('keeps explicit zeros as measured values', () => {
    const { outcome } = run([init(), delta('x'), result({ usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 } })])
    expect(outcome).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } })
  })

  it('exposes the latest known usage before the stream ends', () => {
    const parser = createStreamParser()
    parser.push(init())
    expect(parser.latestUsage()).toBeUndefined()
    parser.push(result())
    expect(parser.latestUsage()).toMatchObject({ outputTokens: 42 })
  })

  it('ignores blank and non-JSON lines', () => {
    const { texts, outcome } = run(['', 'warning: something', init(), delta('ok'), result()])
    expect(texts).toEqual(['ok'])
    expect(outcome.kind).toBe('success')
  })

  it('returns the full runtime error text; the runner redacts and then truncates it', () => {
    const { outcome } = run([init(), result({ is_error: true, result: 'x'.repeat(5000) })])
    expect(outcome.kind === 'error' && outcome.message.length).toBe(5000)
  })
})
