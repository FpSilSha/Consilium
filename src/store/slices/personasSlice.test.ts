import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { createPersonasSlice, type PersonasSlice } from './personasSlice'
import { BUILT_IN_PERSONAS, sortPersonas } from '@/features/personas'
import { toPersona } from '@/features/personas/persona-validators'

// The slice exposes `personas` as the merged-and-SORTED list of built-ins
// + customs. The raw BUILT_IN_PERSONAS array is in declaration order, not
// alphabetical, so tests that compare against "just the built-ins" must
// compare against the sorted version.
const SORTED_BUILT_INS = sortPersonas([...BUILT_IN_PERSONAS])

/**
 * Tests for the personas slice — focused on the merged-list invariant
 * and the custom CRUD actions. Uses a fresh in-memory zustand store per
 * test (no shared state) so test ordering doesn't matter.
 *
 * The merge invariant: `personas` is ALWAYS the sorted union of
 * built-ins + customs. After every CRUD action, both `customPersonas`
 * AND `personas` should reflect the change atomically.
 */

function createStore() {
  return create<PersonasSlice>()(createPersonasSlice)
}

const customA = toPersona({ id: 'custom_a_111111', name: 'Alpha', content: 'A body' })
const customB = toPersona({ id: 'custom_b_222222', name: 'Bravo', content: 'B body' })
const customC = toPersona({ id: 'custom_c_333333', name: 'Charlie', content: 'C body' })

describe('personasSlice — initial state', () => {
  it('starts with built-in personas in `personas`', () => {
    const store = createStore()
    expect(store.getState().personas).toEqual(SORTED_BUILT_INS)
  })

  it('starts with empty `customPersonas`', () => {
    const store = createStore()
    expect(store.getState().customPersonas).toEqual([])
  })

  it('starts with personasLoaded false', () => {
    const store = createStore()
    expect(store.getState().personasLoaded).toBe(false)
  })
})

describe('personasSlice — setCustomPersonas (bulk replace)', () => {
  it('sets customPersonas to the provided array', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA, customB])
    expect(store.getState().customPersonas).toEqual([customA, customB])
  })

  it('reconciles `personas` to include both built-ins and the new customs', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA])
    const merged = store.getState().personas
    expect(merged.length).toBe(BUILT_IN_PERSONAS.length + 1)
    expect(merged.some((p) => p.id === customA.id)).toBe(true)
    for (const builtin of BUILT_IN_PERSONAS) {
      expect(merged.some((p) => p.id === builtin.id)).toBe(true)
    }
  })

  it('replacing customs to an empty array restores personas to just built-ins', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA, customB])
    store.getState().setCustomPersonas([])
    expect(store.getState().personas).toEqual(SORTED_BUILT_INS)
    expect(store.getState().customPersonas).toEqual([])
  })

  it('places built-in personas BEFORE custom personas in the merged list', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA])
    const merged = store.getState().personas
    const builtinIdxs = merged
      .map((p, i) => (p.isBuiltIn ? i : -1))
      .filter((i) => i !== -1)
    const customIdx = merged.findIndex((p) => p.id === customA.id)
    // All built-in indices should be less than every custom index
    for (const bi of builtinIdxs) {
      expect(bi).toBeLessThan(customIdx)
    }
  })
})

describe('personasSlice — addCustomPersona', () => {
  it('appends a new custom persona', () => {
    const store = createStore()
    store.getState().addCustomPersona(customA)
    expect(store.getState().customPersonas).toEqual([customA])
  })

  it('reconciles `personas` after add', () => {
    const store = createStore()
    store.getState().addCustomPersona(customA)
    expect(store.getState().personas.some((p) => p.id === customA.id)).toBe(true)
  })

  it('upserts when a persona with the same id is added again (rename)', () => {
    const store = createStore()
    store.getState().addCustomPersona(customA)
    const renamed = { ...customA, name: 'Alpha Renamed', content: 'New body' }
    store.getState().addCustomPersona(renamed)
    expect(store.getState().customPersonas).toHaveLength(1)
    expect(store.getState().customPersonas[0]?.name).toBe('Alpha Renamed')
    expect(store.getState().customPersonas[0]?.content).toBe('New body')
  })

  it('preserves order when upserting (does not move the entry)', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA, customB, customC])
    const renamed = { ...customB, name: 'Bravo v2' }
    store.getState().addCustomPersona(renamed)
    const ids = store.getState().customPersonas.map((p) => p.id)
    expect(ids).toEqual([customA.id, customB.id, customC.id])
  })

  it('refuses to add a persona with a builtin_ prefixed id (symmetric with removeCustomPersona)', () => {
    const store = createStore()
    const shadow = { ...customA, id: 'builtin_cfo' }
    store.getState().addCustomPersona(shadow)
    // The custom list stays empty — the shadow is rejected.
    expect(store.getState().customPersonas).toEqual([])
    // The merged list is unchanged from the initial state (no duplicates,
    // no shadowing of the real built-in CFO).
    expect(store.getState().personas).toEqual(SORTED_BUILT_INS)
  })
})

describe('personasSlice — removeCustomPersona', () => {
  beforeEach(() => {
    // Each test creates its own store; nothing to reset globally.
  })

  it('removes the persona with the matching id', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA, customB])
    store.getState().removeCustomPersona(customA.id)
    expect(store.getState().customPersonas).toEqual([customB])
  })

  it('reconciles `personas` after remove', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA, customB])
    store.getState().removeCustomPersona(customA.id)
    expect(store.getState().personas.some((p) => p.id === customA.id)).toBe(false)
    expect(store.getState().personas.some((p) => p.id === customB.id)).toBe(true)
  })

  it('is a no-op for an unknown id', () => {
    const store = createStore()
    store.getState().setCustomPersonas([customA])
    store.getState().removeCustomPersona('custom_nonexistent_999999')
    expect(store.getState().customPersonas).toEqual([customA])
  })

  it('refuses to remove a built-in persona even if its id is passed', () => {
    const store = createStore()
    const builtinId = BUILT_IN_PERSONAS[0]?.id ?? ''
    expect(builtinId).toMatch(/^builtin_/)
    store.getState().removeCustomPersona(builtinId)
    expect(store.getState().personas).toEqual(SORTED_BUILT_INS)
  })
})

describe('personasSlice — merge invariant after sequential mutations', () => {
  it('handles add → add → remove → remove correctly', () => {
    const store = createStore()
    store.getState().addCustomPersona(customA)
    store.getState().addCustomPersona(customB)
    expect(store.getState().customPersonas).toHaveLength(2)
    expect(store.getState().personas.length).toBe(BUILT_IN_PERSONAS.length + 2)

    store.getState().removeCustomPersona(customA.id)
    expect(store.getState().customPersonas).toHaveLength(1)
    expect(store.getState().personas.length).toBe(BUILT_IN_PERSONAS.length + 1)
    expect(store.getState().personas.some((p) => p.id === customA.id)).toBe(false)

    store.getState().removeCustomPersona(customB.id)
    expect(store.getState().customPersonas).toHaveLength(0)
    expect(store.getState().personas).toEqual(SORTED_BUILT_INS)
  })

  it('upsert via addCustomPersona keeps personas in sync', () => {
    const store = createStore()
    store.getState().addCustomPersona(customA)
    const renamed = { ...customA, name: 'Alpha Renamed' }
    store.getState().addCustomPersona(renamed)
    const merged = store.getState().personas
    const found = merged.find((p) => p.id === customA.id)
    expect(found?.name).toBe('Alpha Renamed')
  })
})
