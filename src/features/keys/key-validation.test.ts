import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateKey } from './key-validation'

afterEach(() => vi.unstubAllGlobals())

describe('key validation', () => {
  it('checks the authenticated OpenRouter key endpoint, not its public models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await validateKey('invalid', 'openrouter')).toMatchObject({ valid: false, reason: 'auth_failure' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/key')
  })

  it('validates Anthropic keys with a free GET rather than a billable message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await validateKey('test', 'anthropic')).toEqual({ valid: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/models')
    expect(fetchMock.mock.calls[0]?.[1].method).toBe('GET')
    expect(fetchMock.mock.calls[0]?.[1].body).toBeUndefined()
  })
})
