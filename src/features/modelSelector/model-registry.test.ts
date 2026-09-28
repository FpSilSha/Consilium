import { describe, expect, it } from 'vitest'
import { getAllModels, getModelById, getModelsForProvider } from './model-registry'
describe('offline model registry', () => {
  it('covers all direct providers with current fallback choices', () => {
    for (const provider of ['anthropic', 'openai', 'google', 'xai', 'deepseek'] as const) {
      expect(getModelsForProvider(provider).length).toBeGreaterThan(0)
      expect(getModelsForProvider(provider).every((model) => model.provider === provider)).toBe(true)
    }
    for (const id of ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'gpt-6-astra', 'gemini-3.8-flash', 'grok-4.7', 'deepseek-flash']) {
      expect(getAllModels().some((model) => model.id === id)).toBe(true)
    }
  })
  it('has unique IDs and valid numeric metadata', () => {
    const models = getAllModels()
    expect(new Set(models.map((model) => model.id)).size).toBe(models.length)
    for (const model of models) {
      expect(model.name.trim()).not.toBe('')
      expect(model.contextWindow).toBeGreaterThan(0)
      expect(model.inputPricePerToken).toBeGreaterThanOrEqual(0)
      expect(model.outputPricePerToken).toBeGreaterThanOrEqual(0)
    }
  })
  it('keeps historical sessions readable without suggesting retired models', () => {
    expect(getModelById('gemini-2.0-flash')?.contextWindow).toBe(1000000)
    expect(getModelsForProvider('google').some((model) => model.id === 'gemini-2.0-flash')).toBe(false)
    expect(getModelById('deepseek-chat')).toBeDefined()
  })
  it('prefers live metadata and does not duplicate fallback records', () => {
    const updated = { ...getModelById('claude-opus-4-6')!, contextWindow: 12345 }
    expect(getModelById(updated.id, [updated])).toBe(updated)
    expect(getAllModels([updated]).filter((model) => model.id === updated.id)).toEqual([updated])
  })
  it('corrects Opus 4.6 and Haiku 4.5 base prices', () => {
    expect(getModelById('claude-opus-4-6')).toMatchObject({ inputPricePerToken: 0.000005, outputPricePerToken: 0.000025 })
    expect(getModelById('claude-haiku-4-5-20251001')).toMatchObject({ inputPricePerToken: 0.000001, outputPricePerToken: 0.000005 })
  })
  it('does not invent prices for models with only verified IDs', () => {
    expect(getModelById('deepseek-flash')?.pricingKnown).toBe(false)
  })
  it('handles missing IDs and preserves the fallback reference', () => {
    expect(getModelById('does-not-exist')).toBeUndefined()
    expect(getModelsForProvider('openrouter')).toEqual([])
    expect(getAllModels()).toBe(getAllModels())
  })
})
