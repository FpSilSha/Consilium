import { describe, expect, it } from 'vitest'
import { availableModels } from './available-models'
describe('available models', () => {
  it('does not replace a successful empty catalog with unverified fallback IDs', () => {
    expect(availableModels('openai', [], 'loaded')).toEqual([])
  })
  it('uses offline fallback on an initial failure and retains previous live data on later failures', () => {
    expect(availableModels('openai', [], 'error').length).toBeGreaterThan(0)
    const cached = [{ id: 'future', name: 'Future', provider: 'openai' as const, contextWindow: 0, inputPricePerToken: 0, outputPricePerToken: 0 }]
    expect(availableModels('openai', cached, 'error')).toBe(cached)
  })
  it('offers the fixed subscription list for Claude subscription advisors, never priced as free', () => {
    const models = availableModels('claude-subscription', [], 'idle')
    expect(models.map((m) => m.id)).toEqual(['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-haiku-4-5'])
    expect(models.every((m) => m.provider === 'claude-subscription' && m.pricingKnown === false)).toBe(true)
  })
})
