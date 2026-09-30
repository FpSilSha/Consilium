import { describe, expect, it } from 'vitest'
import { openaiAdapter } from './openai'
import { openrouterAdapter, deepseekAdapter, xaiAdapter } from './openai-compatible'
import type { ApiRequestConfig, StreamChunk } from '../types'

const config: ApiRequestConfig = { provider: 'openai', model: 'gpt-6-astra', apiKey: 'test-key', systemPrompt: 'Be helpful', messages: [{ role: 'user', content: 'Hi' }], maxTokens: 1234 }

async function parse(parts: readonly string[]): Promise<StreamChunk[]> {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (const part of parts) controller.enqueue(encoder.encode(part))
    controller.close()
  } })
  const chunks: StreamChunk[] = []
  for await (const chunk of openrouterAdapter.parseStream(stream.getReader())) chunks.push(chunk)
  return chunks
}
describe('OpenAI and OpenRouter requests', () => {
  it('uses the modern OpenAI completion limit', () => {
    const body = JSON.parse(openaiAdapter.buildRequest(config).body)
    expect(body.max_completion_tokens).toBe(1234)
    expect(body.max_tokens).toBeUndefined()
  })
  it.each([openrouterAdapter, deepseekAdapter, xaiAdapter])('keeps compatible token limits for $provider', (adapter) => {
    const body = JSON.parse(adapter.buildRequest({ ...config, provider: adapter.provider }).body)
    expect(body.max_tokens).toBe(1234)
    expect(body.max_completion_tokens).toBeUndefined()
  })
  it('uses the actual project URL for OpenRouter attribution', () => {
    expect(openrouterAdapter.buildRequest({ ...config, provider: 'openrouter' }).headers['HTTP-Referer']).toBe('https://github.com/FpSilSha/Consilium')
  })
  it('reports OpenRouter errors delivered inside a successful HTTP stream', async () => {
    const chunks = await parse([': OPENROUTER PROCESSING\n\n', 'data: {"error":{"message":"Upstream provider failed","code":502}}\n\n'])
    expect(chunks).toEqual([{ type: 'error', content: 'Upstream provider failed' }])
  })
  it('keeps usage on the same event as content and handles split chunks without a trailing newline', async () => {
    const chunks = await parse(['data:{"choices":[{"delta":{"content":"Hel', 'lo"}}],"usage":{"prompt_tokens":12,"completion_tokens":3}}'])
    expect(chunks).toEqual([{ type: 'content', content: 'Hello', tokenUsage: { inputTokens: 12, outputTokens: 3 } }])
  })
  it('parses final usage after finish_reason and ignores reasoning-only deltas', async () => {
    const chunks = await parse([
      'data: {"choices":[{"delta":{"reasoning":"private"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20}}\n\ndata: [DONE]\n\n',
    ])
    expect(chunks).toEqual([{ type: 'content', content: 'answer' }, { type: 'done', content: '', tokenUsage: { inputTokens: 10, outputTokens: 20 } }])
  })
})
