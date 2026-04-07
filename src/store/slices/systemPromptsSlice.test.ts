import { describe, it, expect } from 'vitest'
import { create } from 'zustand'
import { createSystemPromptsSlice, type SystemPromptsSlice } from './systemPromptsSlice'
import { DEFAULT_SYSTEM_PROMPTS_STATE } from '@/features/systemPrompts/system-prompt-resolver'
import type { SystemPromptEntry } from '@/features/systemPrompts/types'

/**
 * Tests for the systemPromptsSlice — focused on the CRUD actions,
 * the builtin_ guard, and the systemPromptsConfig setter. Uses a
 * fresh in-memory zustand store per test so ordering doesn't matter.
 *
 * Coverage:
 *   - initial state matches DEFAULT_SYSTEM_PROMPTS_STATE
 *   - setCustomSystemPrompts bulk-replaces
 *   - addCustomSystemPrompt appends new, upserts existing
 *   - addCustomSystemPrompt rejects builtin_ prefix
 *   - removeCustomSystemPrompt filters, no-ops on unknown ids
 *   - removeCustomSystemPrompt no-ops on builtin_ prefix
 *   - setSystemPromptsConfig replaces the whole state object
 *
 * The pure resolver functions (resolveAdvisorSystemPrompt etc.)
 * are tested separately in system-prompt-resolver.test.ts — this
 * file only covers the slice's CRUD/state actions.
 */

function createStore() {
  return create<SystemPromptsSlice>()(createSystemPromptsSlice)
}

const advisorEntry: SystemPromptEntry = {
  id: 'custom_sysprompt_alpha_111111',
  category: 'advisor',
  name: 'Alpha Advisor',
  content: 'You are an alpha advisor.',
  isBuiltIn: false,
}

const switchEntry: SystemPromptEntry = {
  id: 'custom_sysprompt_handoff_222222',
  category: 'persona-switch',
  name: 'Bravo Handoff',
  content: 'Summarize the conversation. Old: {oldLabel}, new: {newLabel}\n{messages}',
  isBuiltIn: false,
}

describe('systemPromptsSlice — initial state', () => {
  it('starts with empty customSystemPrompts', () => {
    const store = createStore()
    expect(store.getState().customSystemPrompts).toEqual([])
  })

  it('starts with DEFAULT_SYSTEM_PROMPTS_STATE in systemPromptsConfig', () => {
    const store = createStore()
    expect(store.getState().systemPromptsConfig).toEqual(DEFAULT_SYSTEM_PROMPTS_STATE)
  })
})

describe('systemPromptsSlice — setCustomSystemPrompts', () => {
  it('bulk-replaces the entries', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry, switchEntry])
    expect(store.getState().customSystemPrompts).toEqual([advisorEntry, switchEntry])
  })

  it('replacing with an empty array clears existing entries', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry])
    store.getState().setCustomSystemPrompts([])
    expect(store.getState().customSystemPrompts).toEqual([])
  })
})

describe('systemPromptsSlice — addCustomSystemPrompt', () => {
  it('appends a new entry when no id collision', () => {
    const store = createStore()
    store.getState().addCustomSystemPrompt(advisorEntry)
    expect(store.getState().customSystemPrompts).toEqual([advisorEntry])
  })

  it('preserves entries from BOTH categories together', () => {
    const store = createStore()
    store.getState().addCustomSystemPrompt(advisorEntry)
    store.getState().addCustomSystemPrompt(switchEntry)
    const customs = store.getState().customSystemPrompts
    expect(customs).toHaveLength(2)
    expect(customs.some((c) => c.category === 'advisor')).toBe(true)
    expect(customs.some((c) => c.category === 'persona-switch')).toBe(true)
  })

  it('upserts (updates in place) when an entry with the same id exists', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry, switchEntry])
    const renamed: SystemPromptEntry = { ...advisorEntry, name: 'Alpha Advisor v2' }
    store.getState().addCustomSystemPrompt(renamed)
    expect(store.getState().customSystemPrompts).toHaveLength(2)
    expect(store.getState().customSystemPrompts[0]?.id).toBe(advisorEntry.id)
    expect(store.getState().customSystemPrompts[0]?.name).toBe('Alpha Advisor v2')
    expect(store.getState().customSystemPrompts[1]).toEqual(switchEntry)
  })

  it('refuses to add an entry with a builtin_ prefixed id', () => {
    const store = createStore()
    const shadow: SystemPromptEntry = { ...advisorEntry, id: 'builtin_advisor_default' }
    store.getState().addCustomSystemPrompt(shadow)
    expect(store.getState().customSystemPrompts).toEqual([])
  })
})

describe('systemPromptsSlice — removeCustomSystemPrompt', () => {
  it('removes the entry with the matching id', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry, switchEntry])
    store.getState().removeCustomSystemPrompt(advisorEntry.id)
    expect(store.getState().customSystemPrompts).toEqual([switchEntry])
  })

  it('is a no-op for an unknown id', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry])
    store.getState().removeCustomSystemPrompt('custom_sysprompt_missing_999999')
    expect(store.getState().customSystemPrompts).toEqual([advisorEntry])
  })

  it('is a no-op for a builtin_ prefixed id', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry])
    store.getState().removeCustomSystemPrompt('builtin_advisor_default')
    expect(store.getState().customSystemPrompts).toEqual([advisorEntry])
  })
})

describe('systemPromptsSlice — setSystemPromptsConfig', () => {
  it('replaces the whole config object atomically', () => {
    const store = createStore()
    store.getState().setSystemPromptsConfig({
      advisorMode: 'custom',
      advisorCustomId: 'custom_sysprompt_alpha_111111',
      personaSwitchMode: 'off',
      personaSwitchCustomId: null,
    })
    expect(store.getState().systemPromptsConfig).toEqual({
      advisorMode: 'custom',
      advisorCustomId: 'custom_sysprompt_alpha_111111',
      personaSwitchMode: 'off',
      personaSwitchCustomId: null,
    })
  })

  it('does not touch customSystemPrompts when updating config', () => {
    const store = createStore()
    store.getState().setCustomSystemPrompts([advisorEntry])
    store.getState().setSystemPromptsConfig({
      advisorMode: 'custom',
      advisorCustomId: advisorEntry.id,
      personaSwitchMode: 'base',
      personaSwitchCustomId: null,
    })
    expect(store.getState().customSystemPrompts).toEqual([advisorEntry])
  })
})
