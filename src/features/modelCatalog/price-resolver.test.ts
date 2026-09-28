import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import { resolvePrice } from './price-resolver'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { buildPricingIndex } from '@/services/api/catalog/pricing-index'
import { enrichCatalog } from '@/services/api/catalog/enrich-catalog'

const initial = useStore.getState()
afterEach(() => useStore.setState(initial))

describe('catalog pricing', () => {
  it('does not treat unavailable provider pricing as confirmed free', () => {
    useStore.getState().setCatalogModels('openai', [{ id: 'gpt-new', name: 'New', provider: 'openai', contextWindow: 0, inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false }])
    expect(resolvePrice('gpt-new').isKnown).toBe(false)
    expect(buildCostMetadata(undefined, 'gpt-new')).toBeUndefined()
  })

  it('matches native Anthropic IDs to OpenRouter IDs without matching discounted variants', () => {
    const index = buildPricingIndex([
      { id: 'anthropic/claude-sonnet-5:batch', name: 'Batch', provider: 'openrouter', contextWindow: 1000000, inputPricePerToken: 0.000001, outputPricePerToken: 0.000005, pricingKnown: true },
      { id: 'anthropic/claude-fable-5.1', name: 'Fable', provider: 'openrouter', contextWindow: 1000000, inputPricePerToken: 0.00001, outputPricePerToken: 0.00005, pricingKnown: true },
    ])
    const result = enrichCatalog([{ id: 'claude-fable-5-1', name: 'Fable', provider: 'anthropic', contextWindow: 0, inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false }], index)
    expect(result[0]).toMatchObject({ pricingKnown: true, inputPricePerToken: 0.00001, contextWindow: 1000000 })
    expect(index.has('claude-sonnet-5')).toBe(false)
  })

  it('does not overwrite explicitly free pricing when enriching metadata', () => {
    const free = { id: 'same', name: 'Free', provider: 'custom' as const, contextWindow: 0, inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: true }
    const result = enrichCatalog([free], new Map([['same', { input: 1, output: 2, contextWindow: 100 }]]))
    expect(result[0]).toMatchObject({ contextWindow: 100, inputPricePerToken: 0, outputPricePerToken: 0 })
  })
})
