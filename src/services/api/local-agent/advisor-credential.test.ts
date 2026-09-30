import { describe, it, expect, vi } from 'vitest'
import type { ApiKey } from '@/types'
import { resolveAdvisorCredential, credentialRequestFields } from './advisor-credential'

const keys: readonly ApiKey[] = [
  { id: 'k1', provider: 'anthropic', maskedKey: 'sk-...1', createdAt: 0, verified: true },
  { id: 'k2', provider: 'custom', maskedKey: '...2', createdAt: 0, verified: true, baseUrl: 'http://localhost:1234', adapterDefinitionId: 'ad1' },
]

describe('resolveAdvisorCredential', () => {
  it('uses the subscription for the exact claude-subscription provider without reading any key', () => {
    const readKey = vi.fn()
    expect(resolveAdvisorCredential({ provider: 'claude-subscription', keyId: '' }, keys, readKey)).toEqual({ kind: 'subscription' })
    expect(readKey).not.toHaveBeenCalled()
  })

  it.each(['anthropic', 'openai', 'custom', 'unknown'])('treats an empty key ID on %s as a missing key', (provider) => {
    expect(resolveAdvisorCredential({ provider, keyId: '' }, keys, () => 'x')).toEqual({ kind: 'missing-key' })
  })

  it('reports an unreadable key', () => {
    expect(resolveAdvisorCredential({ provider: 'anthropic', keyId: 'k1' }, keys, () => null)).toEqual({ kind: 'unreadable-key' })
  })

  it('returns the key with its custom endpoint fields', () => {
    expect(resolveAdvisorCredential({ provider: 'custom', keyId: 'k2' }, keys, () => 'raw')).toEqual({
      kind: 'api-key', apiKey: 'raw', baseUrl: 'http://localhost:1234', adapterDefinitionId: 'ad1',
    })
  })
})

describe('credentialRequestFields', () => {
  it('sends no key for a subscription', () => {
    expect(credentialRequestFields({ kind: 'subscription' })).toEqual({ apiKey: '' })
  })

  it('passes API key fields through', () => {
    expect(credentialRequestFields({ kind: 'api-key', apiKey: 'raw', baseUrl: 'u' })).toEqual({ apiKey: 'raw', baseUrl: 'u' })
  })
})
