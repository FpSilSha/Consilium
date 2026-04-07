import { describe, it, expect } from 'vitest'
import { create } from 'zustand'
import {
  createCustomCompactPromptsSlice,
  type CustomCompactPromptsSlice,
} from './customCompactPromptsSlice'
import { BUILT_IN_COMPACT_PROMPT_ID } from '@/features/compactPrompts/built-in-compact-prompts'
import type { CustomCompactPrompt } from '@/features/compactPrompts/types'

/**
 * Tests for the customCompactPromptsSlice — focused on CRUD actions,
 * the reserved-id guards (builtin_ prefix AND the concrete base id),
 * and setCompactPromptId. Mirrors the customCompilePromptsSlice test
 * structure.
 *
 * Coverage:
 *   - initial state (empty customs, compactPromptId = built-in default)
 *   - setCustomCompactPrompts bulk-replaces
 *   - addCustomCompactPrompt appends new, upserts existing, rejects reserved
 *   - removeCustomCompactPrompt filters, no-ops on unknown / reserved
 *   - setCompactPromptId updates the active selection
 */

function createStore() {
  return create<CustomCompactPromptsSlice>()(createCustomCompactPromptsSlice)
}

const customA: CustomCompactPrompt = {
  id: 'custom_compactprompt_alpha_111111',
  name: 'Alpha Summarizer',
  content: 'Summarize:\n\n{messages}',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

const customB: CustomCompactPrompt = {
  id: 'custom_compactprompt_beta_222222',
  name: 'Beta Summarizer',
  content: 'In two paragraphs:\n\n{messages}',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

describe('customCompactPromptsSlice — initial state', () => {
  it('starts with empty customCompactPrompts', () => {
    const store = createStore()
    expect(store.getState().customCompactPrompts).toEqual([])
  })

  it('starts with compactPromptId = BUILT_IN_COMPACT_PROMPT_ID', () => {
    const store = createStore()
    expect(store.getState().compactPromptId).toBe(BUILT_IN_COMPACT_PROMPT_ID)
  })
})

describe('customCompactPromptsSlice — setCustomCompactPrompts', () => {
  it('bulk-replaces the entries', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA, customB])
    expect(store.getState().customCompactPrompts).toEqual([customA, customB])
  })

  it('replacing with an empty array clears existing entries', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA])
    store.getState().setCustomCompactPrompts([])
    expect(store.getState().customCompactPrompts).toEqual([])
  })
})

describe('customCompactPromptsSlice — addCustomCompactPrompt', () => {
  it('appends a new entry when no id collision', () => {
    const store = createStore()
    store.getState().addCustomCompactPrompt(customA)
    expect(store.getState().customCompactPrompts).toEqual([customA])
  })

  it('upserts (updates in place) when an entry with the same id exists', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA, customB])
    const renamed = { ...customA, name: 'Alpha Renamed' }
    store.getState().addCustomCompactPrompt(renamed)
    expect(store.getState().customCompactPrompts).toHaveLength(2)
    expect(store.getState().customCompactPrompts[0]?.id).toBe(customA.id)
    expect(store.getState().customCompactPrompts[0]?.name).toBe('Alpha Renamed')
    expect(store.getState().customCompactPrompts[1]).toEqual(customB)
  })

  it('refuses to add an entry with a builtin_ prefixed id', () => {
    const store = createStore()
    const shadow = { ...customA, id: 'builtin_my_fake_compact' }
    store.getState().addCustomCompactPrompt(shadow)
    expect(store.getState().customCompactPrompts).toEqual([])
  })

  it('refuses to add an entry with the concrete BUILT_IN_COMPACT_PROMPT_ID', () => {
    const store = createStore()
    const shadow = { ...customA, id: BUILT_IN_COMPACT_PROMPT_ID }
    store.getState().addCustomCompactPrompt(shadow)
    expect(store.getState().customCompactPrompts).toEqual([])
  })
})

describe('customCompactPromptsSlice — removeCustomCompactPrompt', () => {
  it('removes the entry with the matching id', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA, customB])
    store.getState().removeCustomCompactPrompt(customA.id)
    expect(store.getState().customCompactPrompts).toEqual([customB])
  })

  it('is a no-op for an unknown id', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA])
    store.getState().removeCustomCompactPrompt('custom_compactprompt_missing_999999')
    expect(store.getState().customCompactPrompts).toEqual([customA])
  })

  it('is a no-op for a builtin_ prefixed id', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA])
    store.getState().removeCustomCompactPrompt('builtin_some_id')
    expect(store.getState().customCompactPrompts).toEqual([customA])
  })

  it('is a no-op for the concrete BUILT_IN_COMPACT_PROMPT_ID', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA])
    store.getState().removeCustomCompactPrompt(BUILT_IN_COMPACT_PROMPT_ID)
    expect(store.getState().customCompactPrompts).toEqual([customA])
  })
})

describe('customCompactPromptsSlice — setCompactPromptId', () => {
  it('updates the active selection', () => {
    const store = createStore()
    store.getState().setCompactPromptId('custom_compactprompt_alpha_111111')
    expect(store.getState().compactPromptId).toBe('custom_compactprompt_alpha_111111')
  })

  it('does not touch customCompactPrompts when updating selection', () => {
    const store = createStore()
    store.getState().setCustomCompactPrompts([customA])
    store.getState().setCompactPromptId(customA.id)
    expect(store.getState().customCompactPrompts).toEqual([customA])
  })
})
