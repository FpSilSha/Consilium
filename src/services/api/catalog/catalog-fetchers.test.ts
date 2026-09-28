import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenRouterCatalog } from './fetch-openrouter'
import { fetchAnthropicCatalog } from './fetch-anthropic'
import { fetchGoogleCatalog } from './fetch-google'
import { fetchOpenAICatalog } from './fetch-openai'
import { fetchXAICatalog } from './fetch-xai'
import { fetchDeepSeekCatalog } from './fetch-deepseek'

const reply = (body: unknown) => new Response(JSON.stringify(body))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('provider catalogs', () => {
  it('parses OpenRouter capabilities, keeps free prices, rejects invalid prices and non-chat models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ data: [
      { id: 'vendor/free', name: 'Free', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['reasoning', 'tools'], context_length: 128000, top_provider: { max_completion_tokens: 8192 } },
      { id: 'vendor/unknown', name: 'Unknown', pricing: { prompt: '-1', completion: 'n/a' } },
      { id: 'vendor/missing', name: 'Missing' },
      { id: 'vendor/image', name: 'Image', architecture: { output_modalities: ['image'] } },
      { id: 'vendor/batch:batch', name: 'Batch' },
      null, { id: '', name: 'Bad' },
    ] })))
    const result = await fetchOpenRouterCatalog()
    expect(result.error).toBeUndefined()
    expect(result.models.map((m) => m.id)).toEqual(['vendor/free', 'vendor/missing', 'vendor/unknown'])
    expect(result.models[0]).toMatchObject({ pricingKnown: true, inputPricePerToken: 0, maxOutputTokens: 8192, inputModalities: ['text', 'image'], supportedParameters: ['reasoning', 'tools'] })
    expect(result.models[1]?.pricingKnown).toBe(false)
    expect(result.models[2]).toMatchObject({ pricingKnown: false, inputPricePerToken: 0 })
  })

  it('loads every Anthropic page using native authentication and token limits', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ data: [{ id: 'claude-one', display_name: 'One', max_input_tokens: 1000000, max_tokens: 128000 }], has_more: true, last_id: 'claude-one' }))
      .mockResolvedValueOnce(reply({ data: [{ id: 'claude-two', display_name: 'Two' }], has_more: false }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchAnthropicCatalog('test-key')
    expect(result.models).toHaveLength(2)
    expect(result.models[0]).toMatchObject({ contextWindow: 1000000, maxOutputTokens: 128000, pricingKnown: false })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('after_id=claude-one')
    expect(fetchMock.mock.calls[0]?.[1].headers).toMatchObject({ 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' })
  })

  it('paginates Google, deduplicates models, and excludes embedding/audio/image models', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ models: [
        { name: 'models/gemini-text', displayName: 'Text', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1000000, outputTokenLimit: 8192 },
        { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-tts', supportedGenerationMethods: ['generateContent'] },
      ], nextPageToken: 'next / page' }))
      .mockResolvedValueOnce(reply({ models: [
        { name: 'models/gemini-text', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-other', supportedGenerationMethods: ['generateContent'] },
      ] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchGoogleCatalog('test-key')
    expect(result.models.map((m) => m.id).sort()).toEqual(['gemini-other', 'gemini-text'])
    expect(result.models.find((m) => m.id === 'gemini-text')?.maxOutputTokens).toBe(8192)
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get('pageToken')).toBe('next / page')
  })

  it('rejects repeated pagination cursors instead of hanging or returning partial catalogs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply({ models: [], nextPageToken: 'loop' })))
    const result = await fetchGoogleCatalog('test-key')
    expect(result.error).toContain('pagination')
    expect(result.models).toEqual([])
  })

  it('lists conversational OpenAI models without image, audio, embedding, or Responses-only models', async () => {
    const ids = ['gpt-6-astra', 'gpt-5.6-luna', 'o3', 'gpt-4o-mini', 'ft:gpt-4o-mini:org:test', 'text-embedding-3-small', 'gpt-image-1', 'gpt-4o-transcribe', 'gpt-realtime', 'gpt-5-pro', 'o3-deep-research', 'gpt-5-codex']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ data: ids.map((id) => ({ id })) })))
    const result = await fetchOpenAICatalog('test-key')
    expect(result.models.map((m) => m.id).sort()).toEqual(ids.slice(0, 5).sort())
    expect(result.models.every((m) => m.pricingKnown === false)).toBe(true)
  })

  it('uses the xAI language catalog and converts cents per 100M tokens correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ models: [
      { id: 'grok-current', input_modalities: ['text', 'image'], output_modalities: ['text'], prompt_text_token_price: 16000, completion_text_token_price: 48000 },
      { id: 'grok-image', output_modalities: ['image'] },
    ] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchXAICatalog('test-key')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/language-models')
    expect(result.models).toHaveLength(1)
    expect(result.models[0]).toMatchObject({ inputPricePerToken: 0.0000016, outputPricePerToken: 0.0000048, pricingKnown: true })
  })

  it('does not hardcode the DeepSeek IDs returned by its models endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ data: [{ id: 'deepseek-flash' }, { id: 'deepseek-future' }] })))
    expect((await fetchDeepSeekCatalog('test-key')).models).toHaveLength(2)
  })

  it('preserves timeout protection with a caller signal', async () => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn().mockResolvedValue(reply({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchOpenRouterCatalog(controller.signal)
    expect(timeout).toHaveBeenCalled()
    expect(fetchMock.mock.calls[0]?.[1].signal).not.toBe(controller.signal)
  })

  it('propagates caller cancellation, including a non-DOMException reason', async () => {
    const controller = new AbortController()
    const reason = new Error('cancelled by caller')
    controller.abort(reason)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(reason))
    await expect(fetchOpenAICatalog('test-key', controller.signal)).rejects.toBe(reason)
  })

  it.each([null, {}, { data: 'bad' }])('returns a safe error for a malformed response %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(payload)))
    expect((await fetchOpenRouterCatalog()).error).toBeDefined()
  })
})
