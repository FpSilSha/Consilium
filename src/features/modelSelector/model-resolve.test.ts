import { describe, it, expect } from 'vitest'
import { resolveAllModels, resolveModelById } from './model-resolve'

describe('model resolution with the Claude subscription seat', () => {
  it('keeps subscription models out of the key-based model list used by onboarding', () => {
    expect(resolveAllModels().some((m) => m.provider === 'claude-subscription')).toBe(false)
  })

  it('finds subscription model limits for compaction when no catalog has them', () => {
    expect(resolveModelById('claude-sonnet-5-5')).toMatchObject({ contextWindow: 1_000_000 })
  })
})
