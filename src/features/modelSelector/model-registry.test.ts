import { describe, it, expect } from 'vitest'
import { getModelsForProvider, getModelById, getAllModels } from './model-registry'

describe('model-registry', () => {
  describe('getAllModels', () => {
    it('returns exactly 12 models', () => {
      expect(getAllModels()).toHaveLength(12)
    })

    it('every model has the required fields with correct types', () => {
      for (const model of getAllModels()) {
        expect(typeof model.id).toBe('string')
        expect(model.id.length).toBeGreaterThan(0)
        expect(typeof model.name).toBe('string')
        expect(model.name.length).toBeGreaterThan(0)
        expect(typeof model.provider).toBe('string')
        expect(typeof model.contextWindow).toBe('number')
        expect(model.contextWindow).toBeGreaterThan(0)
        expect(typeof model.inputPricePerToken).toBe('number')
        expect(typeof model.outputPricePerToken).toBe('number')
      }
    })

    it('has no duplicate IDs', () => {
      const ids = getAllModels().map((m) => m.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('output price is always >= input price for every model (pricing sanity)', () => {
      for (const model of getAllModels()) {
        expect(model.outputPricePerToken).toBeGreaterThanOrEqual(model.inputPricePerToken)
      }
    })

    it('all 5 providers are represented', () => {
      const providers = new Set(getAllModels().map((m) => m.provider))
      expect(providers).toContain('anthropic')
      expect(providers).toContain('openai')
      expect(providers).toContain('google')
      expect(providers).toContain('xai')
      expect(providers).toContain('deepseek')
    })

    it('returns a readonly reference (same object on repeated calls)', () => {
      expect(getAllModels()).toBe(getAllModels())
    })
  })

  describe('getModelsForProvider', () => {
    it('returns only anthropic models and there are exactly 3', () => {
      const models = getModelsForProvider('anthropic')
      expect(models).toHaveLength(3)
      for (const m of models) {
        expect(m.provider).toBe('anthropic')
      }
    })

    it('returns only openai models and there are exactly 3', () => {
      const models = getModelsForProvider('openai')
      expect(models).toHaveLength(3)
      for (const m of models) {
        expect(m.provider).toBe('openai')
      }
    })

    it('returns only google models and there are exactly 2', () => {
      const models = getModelsForProvider('google')
      expect(models).toHaveLength(2)
      for (const m of models) {
        expect(m.provider).toBe('google')
      }
    })

    it('returns only xai models and there are exactly 2', () => {
      const models = getModelsForProvider('xai')
      expect(models).toHaveLength(2)
      for (const m of models) {
        expect(m.provider).toBe('xai')
      }
    })

    it('returns only deepseek models and there are exactly 2', () => {
      const models = getModelsForProvider('deepseek')
      expect(models).toHaveLength(2)
      for (const m of models) {
        expect(m.provider).toBe('deepseek')
      }
    })

    it('returns an empty array for an unknown provider', () => {
      // Cast needed to pass a value outside the union for this edge-case test
      const result = getModelsForProvider('unknown-provider' as Parameters<typeof getModelsForProvider>[0])
      expect(result).toEqual([])
    })

    it('provider filter is case-sensitive — wrong case returns empty array', () => {
      const result = getModelsForProvider('Anthropic' as Parameters<typeof getModelsForProvider>[0])
      expect(result).toEqual([])
    })

    it('all models returned by provider are also present in getAllModels()', () => {
      const all = getAllModels()
      for (const provider of ['anthropic', 'openai', 'google', 'xai', 'deepseek'] as const) {
        for (const m of getModelsForProvider(provider)) {
          expect(all).toContainEqual(m)
        }
      }
    })
  })

  describe('getModelById', () => {
    it('returns the correct model for claude-opus-4-6 with all pricing fields', () => {
      const model = getModelById('claude-opus-4-6')
      expect(model).toBeDefined()
      expect(model?.id).toBe('claude-opus-4-6')
      expect(model?.name).toBe('Claude Opus 4.6')
      expect(model?.provider).toBe('anthropic')
      expect(model?.contextWindow).toBe(200000)
      expect(model?.inputPricePerToken).toBe(0.000015)
      expect(model?.outputPricePerToken).toBe(0.000075)
    })

    it('returns the correct model for claude-sonnet-4-6', () => {
      const model = getModelById('claude-sonnet-4-6')
      expect(model).toBeDefined()
      expect(model?.provider).toBe('anthropic')
      expect(model?.inputPricePerToken).toBe(0.000003)
      expect(model?.outputPricePerToken).toBe(0.000015)
    })

    it('returns the correct model for gpt-4o', () => {
      const model = getModelById('gpt-4o')
      expect(model).toBeDefined()
      expect(model?.provider).toBe('openai')
      expect(model?.contextWindow).toBe(128000)
    })

    it('returns the correct model for gemini-2.0-flash with 1M context window', () => {
      const model = getModelById('gemini-2.0-flash')
      expect(model).toBeDefined()
      expect(model?.provider).toBe('google')
      expect(model?.contextWindow).toBe(1000000)
    })

    it('returns the correct model for grok-3', () => {
      const model = getModelById('grok-3')
      expect(model).toBeDefined()
      expect(model?.provider).toBe('xai')
      expect(model?.contextWindow).toBe(131072)
    })

    it('returns the correct model for deepseek-reasoner', () => {
      const model = getModelById('deepseek-reasoner')
      expect(model).toBeDefined()
      expect(model?.provider).toBe('deepseek')
      expect(model?.contextWindow).toBe(128000)
    })

    it('returns undefined for a completely unknown model ID', () => {
      expect(getModelById('does-not-exist')).toBeUndefined()
    })

    it('returns undefined for an empty string', () => {
      expect(getModelById('')).toBeUndefined()
    })

    it('is case-sensitive — upper-cased ID returns undefined', () => {
      expect(getModelById('Claude-Opus-4-6')).toBeUndefined()
      expect(getModelById('GPT-4O')).toBeUndefined()
    })

    it('all 12 known IDs resolve to a model', () => {
      const knownIds = [
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
        'gpt-4o',
        'gpt-4o-mini',
        'o3',
        'gemini-2.0-flash',
        'gemini-2.5-pro',
        'grok-3',
        'grok-3-mini',
        'deepseek-chat',
        'deepseek-reasoner',
      ]
      for (const id of knownIds) {
        expect(getModelById(id), `Expected model for id: ${id}`).toBeDefined()
      }
    })
  })
})
