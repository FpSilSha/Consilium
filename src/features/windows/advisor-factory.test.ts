import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import type { ApiKey, ModelInfo } from '@/types'
import { createDefaultAdvisorWindow } from './advisor-factory'

const initial = useStore.getState()
const keys: readonly ApiKey[] = [
  { id: 'anthropic-fixture', provider: 'anthropic', maskedKey: 'fixture', createdAt: 0, verified: true },
  { id: 'deepseek-fixture', provider: 'deepseek', maskedKey: 'fixture', createdAt: 0, verified: true },
]
const unknown: ModelInfo = {
  id: 'deepseek-new', name: 'DeepSeek new', provider: 'deepseek', contextWindow: 0,
  inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: false,
}
afterEach(() => useStore.setState(initial))
function loaded(): void {
  for (const key of keys) {
    useStore.getState().setCatalogModels(key.provider, [])
    useStore.getState().setCatalogStatus(key.provider, 'loaded')
  }
}
describe('advisor model selection', () => {
  it('uses an available model with unknown pricing when an earlier provider has no models', async () => {
    loaded()
    useStore.getState().setCatalogModels('deepseek', [unknown])
    const advisor = await createDefaultAdvisorWindow([], [], keys)
    expect(advisor).toMatchObject({ provider: 'deepseek', keyId: 'deepseek-fixture', model: 'deepseek-new', error: null })
  })
  it('reports an empty catalog instead of inventing a model for a different provider', async () => {
    loaded()
    const advisor = await createDefaultAdvisorWindow([], [], keys)
    expect(advisor.model).toBe('')
    expect(advisor.error).toContain('No compatible model')
  })
  it('prefers confirmed free pricing over unknown pricing', async () => {
    loaded()
    useStore.getState().setCatalogModels('anthropic', [{ ...unknown, id: 'unknown-claude', provider: 'anthropic' }])
    useStore.getState().setCatalogModels('deepseek', [{ ...unknown, id: 'known-free', pricingKnown: true }])
    const advisor = await createDefaultAdvisorWindow([], [], keys)
    expect(advisor.model).toBe('known-free')
  })
})
