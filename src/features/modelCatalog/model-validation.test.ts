import { afterEach, describe, expect, it, vi } from 'vitest'
import { testModelId, testWillCost } from './model-validation'

afterEach(() => vi.unstubAllGlobals())
describe('model ID validation', () => {
  it('checks Anthropic availability without sending a message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'claude-opus-5' }], has_more: false })))
    vi.stubGlobal('fetch', fetchMock)
    expect(testWillCost('anthropic')).toBe(false)
    expect(await testModelId('anthropic', 'claude-opus-5', 'fixture-key')).toEqual({ valid: true })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/models')
    expect(fetchMock.mock.calls[0]?.[1].body).toBeUndefined()
  })
  it('does not issue a request after cancellation', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    expect(await testModelId('openrouter', 'test', 'fixture-key', controller.signal)).toMatchObject({ valid: false, error: 'Cancelled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
