import { describe, it, expect } from 'vitest'
import { create } from 'zustand'
import { createCustomCompilePromptsSlice, type CustomCompilePromptsSlice } from './customCompilePromptsSlice'
import { COMPILE_PRESETS } from '@/features/chat/compile-presets'
import type { CustomCompilePrompt } from '@/features/compilePrompts/types'

/**
 * Tests for the customCompilePromptsSlice — focused on the CRUD
 * actions and their guards. Uses a fresh in-memory zustand store per
 * test so ordering doesn't matter.
 *
 * Coverage:
 *   - initial state is an empty array
 *   - setCustomCompilePrompts bulk-replaces
 *   - addCustomCompilePrompt appends new, upserts existing
 *   - addCustomCompilePrompt rejects `builtin_` prefix
 *   - addCustomCompilePrompt rejects base preset ids (shadow guard)
 *   - removeCustomCompilePrompt filters, is a no-op on unknown ids
 *   - removeCustomCompilePrompt is a no-op on reserved ids
 */

function createStore() {
  return create<CustomCompilePromptsSlice>()(createCustomCompilePromptsSlice)
}

const custom: CustomCompilePrompt = {
  id: 'custom_compileprompt_alpha_111111',
  label: 'Alpha',
  description: 'First custom',
  prompt: 'First prompt body.',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

const customB: CustomCompilePrompt = {
  id: 'custom_compileprompt_beta_222222',
  label: 'Beta',
  description: 'Second custom',
  prompt: 'Second prompt body.',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

describe('customCompilePromptsSlice — initial state', () => {
  it('starts with an empty customCompilePrompts array', () => {
    const store = createStore()
    expect(store.getState().customCompilePrompts).toEqual([])
  })
})

describe('customCompilePromptsSlice — setCustomCompilePrompts', () => {
  it('bulk-replaces the current entries', () => {
    const store = createStore()
    store.getState().setCustomCompilePrompts([custom, customB])
    expect(store.getState().customCompilePrompts).toEqual([custom, customB])
  })

  it('replacing with an empty array clears existing entries', () => {
    const store = createStore()
    store.getState().setCustomCompilePrompts([custom])
    store.getState().setCustomCompilePrompts([])
    expect(store.getState().customCompilePrompts).toEqual([])
  })
})

describe('customCompilePromptsSlice — addCustomCompilePrompt', () => {
  it('appends a new entry when no id collision', () => {
    const store = createStore()
    store.getState().addCustomCompilePrompt(custom)
    expect(store.getState().customCompilePrompts).toEqual([custom])
  })

  it('upserts (updates in place) when an entry with the same id exists', () => {
    const store = createStore()
    store.getState().setCustomCompilePrompts([custom, customB])
    const renamed = { ...custom, label: 'Alpha Renamed' }
    store.getState().addCustomCompilePrompt(renamed)
    expect(store.getState().customCompilePrompts).toHaveLength(2)
    // Order preserved — upsert does not move the entry
    expect(store.getState().customCompilePrompts[0]?.id).toBe(custom.id)
    expect(store.getState().customCompilePrompts[0]?.label).toBe('Alpha Renamed')
    expect(store.getState().customCompilePrompts[1]).toEqual(customB)
  })

  it('refuses to add an entry with a builtin_ prefixed id', () => {
    const store = createStore()
    const shadow = { ...custom, id: 'builtin_my_fake_preset' }
    store.getState().addCustomCompilePrompt(shadow)
    expect(store.getState().customCompilePrompts).toEqual([])
  })

  it('refuses to add an entry with a base preset id (shadow guard)', () => {
    const store = createStore()
    for (const base of COMPILE_PRESETS) {
      const shadow = { ...custom, id: base.id }
      store.getState().addCustomCompilePrompt(shadow)
    }
    // None of the shadows should have been accepted.
    expect(store.getState().customCompilePrompts).toEqual([])
  })
})

describe('customCompilePromptsSlice — removeCustomCompilePrompt', () => {
  it('removes the entry with the matching id', () => {
    const store = createStore()
    store.getState().setCustomCompilePrompts([custom, customB])
    store.getState().removeCustomCompilePrompt(custom.id)
    expect(store.getState().customCompilePrompts).toEqual([customB])
  })

  it('is a no-op for an unknown id', () => {
    const store = createStore()
    store.getState().setCustomCompilePrompts([custom])
    store.getState().removeCustomCompilePrompt('custom_compileprompt_missing_999999')
    expect(store.getState().customCompilePrompts).toEqual([custom])
  })

  it('is a no-op for a builtin_ prefixed id', () => {
    const store = createStore()
    store.getState().setCustomCompilePrompts([custom])
    store.getState().removeCustomCompilePrompt('builtin_some_id')
    expect(store.getState().customCompilePrompts).toEqual([custom])
  })

  it('is a no-op for a base preset id even if one slipped into the store', () => {
    const store = createStore()
    // Simulate a bypass (e.g., from corrupted disk load) by using
    // setCustomCompilePrompts directly — the guards only fire in the
    // add action.
    const bypass = { ...custom, id: COMPILE_PRESETS[0]!.id }
    store.getState().setCustomCompilePrompts([bypass])
    store.getState().removeCustomCompilePrompt(bypass.id)
    // Remove guard rejects reserved ids, so the bypass survives.
    expect(store.getState().customCompilePrompts).toEqual([bypass])
  })
})
