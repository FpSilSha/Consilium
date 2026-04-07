import { describe, it, expect } from 'vitest'
import {
  getMergedCompilePrompts,
  resolveCompilePrompt,
  resolveCompilePromptWithFallback,
  isValidCustomCompilePromptRow,
} from './compile-prompts-resolver'
import { COMPILE_PRESETS, DEFAULT_PRESET_ID } from '@/features/chat/compile-presets'
import type { CustomCompilePrompt } from './types'

/**
 * Tests for the Compile Prompts resolver — pure functions, no store,
 * no IPC. These cover the contract that CompileDocumentButton,
 * CompileSettingsModal, and DocumentsPanel rely on when looking up
 * a prompt by id across the merged base+custom list.
 */

const customA: CustomCompilePrompt = {
  id: 'custom_compileprompt_technical_111111',
  label: 'Technical Spec',
  description: 'Detailed technical writeup',
  prompt: 'Produce a detailed technical specification from the conversation.',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

const customB: CustomCompilePrompt = {
  id: 'custom_compileprompt_exec_222222',
  label: 'Executive Summary',
  description: 'One-pager for execs',
  prompt: 'Produce a single-page executive summary.',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

describe('getMergedCompilePrompts', () => {
  it('returns all base entries when customs is empty', () => {
    const merged = getMergedCompilePrompts([])
    expect(merged).toHaveLength(COMPILE_PRESETS.length)
    for (const preset of COMPILE_PRESETS) {
      expect(merged.some((p) => p.id === preset.id)).toBe(true)
    }
  })

  it('marks every base entry with isBuiltIn:true', () => {
    const merged = getMergedCompilePrompts([])
    for (const entry of merged) {
      expect(entry.isBuiltIn).toBe(true)
    }
  })

  it('appends custom entries after base entries with isBuiltIn:false', () => {
    const merged = getMergedCompilePrompts([customA, customB])
    const baseEntries = merged.filter((p) => p.isBuiltIn)
    const customEntries = merged.filter((p) => !p.isBuiltIn)
    expect(baseEntries).toHaveLength(COMPILE_PRESETS.length)
    expect(customEntries).toHaveLength(2)
    // Base entries must come first in the merged order
    const lastBaseIdx = merged.findIndex((p) => p.id === customA.id) - 1
    expect(merged[lastBaseIdx]?.isBuiltIn).toBe(true)
  })

  it('preserves base entry order from COMPILE_PRESETS', () => {
    const merged = getMergedCompilePrompts([])
    for (let i = 0; i < COMPILE_PRESETS.length; i++) {
      expect(merged[i]?.id).toBe(COMPILE_PRESETS[i]?.id)
    }
  })

  it('preserves custom entry order from the input array', () => {
    const merged = getMergedCompilePrompts([customA, customB])
    const customIdsInOrder = merged.filter((p) => !p.isBuiltIn).map((p) => p.id)
    expect(customIdsInOrder).toEqual([customA.id, customB.id])
  })

  it('does not mutate the COMPILE_PRESETS input', () => {
    const snapshot = [...COMPILE_PRESETS]
    getMergedCompilePrompts([customA])
    expect(COMPILE_PRESETS).toEqual(snapshot)
  })
})

describe('resolveCompilePrompt', () => {
  it('finds a base entry by id', () => {
    const found = resolveCompilePrompt(DEFAULT_PRESET_ID, [])
    expect(found).not.toBeNull()
    expect(found?.id).toBe(DEFAULT_PRESET_ID)
    expect(found?.isBuiltIn).toBe(true)
  })

  it('finds a custom entry by id', () => {
    const found = resolveCompilePrompt(customA.id, [customA, customB])
    expect(found).not.toBeNull()
    expect(found?.id).toBe(customA.id)
    expect(found?.isBuiltIn).toBe(false)
    expect(found?.label).toBe(customA.label)
  })

  it('returns null for an unknown id', () => {
    expect(resolveCompilePrompt('custom_compileprompt_missing_999999', [customA])).toBeNull()
  })

  it('returns null when id is empty string', () => {
    expect(resolveCompilePrompt('', [customA])).toBeNull()
  })

  it('prefers base over custom when IDs collide (should not happen but defensive)', () => {
    const shadow: CustomCompilePrompt = {
      ...customA,
      id: DEFAULT_PRESET_ID,
    }
    const found = resolveCompilePrompt(DEFAULT_PRESET_ID, [shadow])
    // Base comes first in the merged list, so .find returns the base entry
    expect(found?.isBuiltIn).toBe(true)
  })
})

describe('resolveCompilePromptWithFallback', () => {
  it('returns the matching entry when the id resolves', () => {
    const found = resolveCompilePromptWithFallback(customA.id, [customA])
    expect(found.id).toBe(customA.id)
  })

  it('falls back to the default preset when the id is unknown', () => {
    const found = resolveCompilePromptWithFallback('custom_compileprompt_missing', [])
    expect(found.id).toBe(DEFAULT_PRESET_ID)
  })

  it('falls back to the default preset when the id is empty', () => {
    const found = resolveCompilePromptWithFallback('', [])
    expect(found.id).toBe(DEFAULT_PRESET_ID)
  })

  it('fallback is a base entry with isBuiltIn:true', () => {
    const found = resolveCompilePromptWithFallback('nonsense', [customA])
    expect(found.isBuiltIn).toBe(true)
  })
})

describe('isValidCustomCompilePromptRow', () => {
  const validRow = {
    id: 'custom_compileprompt_test_123456',
    label: 'Test',
    description: 'desc',
    prompt: 'Do the thing.',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }

  it('accepts a valid row', () => {
    expect(isValidCustomCompilePromptRow(validRow)).toBe(true)
  })

  it('rejects null and undefined', () => {
    expect(isValidCustomCompilePromptRow(null)).toBe(false)
    expect(isValidCustomCompilePromptRow(undefined)).toBe(false)
  })

  it('rejects missing id', () => {
    const { id: _id, ...rest } = validRow
    expect(isValidCustomCompilePromptRow(rest)).toBe(false)
  })

  it('rejects empty id', () => {
    expect(isValidCustomCompilePromptRow({ ...validRow, id: '' })).toBe(false)
  })

  it('rejects empty label', () => {
    expect(isValidCustomCompilePromptRow({ ...validRow, label: '' })).toBe(false)
  })

  it('rejects empty prompt', () => {
    // The prompt field is the actual compile instruction — an empty
    // prompt is meaningless for compile, unlike system prompts where
    // empty is allowed (documented as "no instructions").
    expect(isValidCustomCompilePromptRow({ ...validRow, prompt: '' })).toBe(false)
  })

  it('accepts empty description (description is a UI hint, not required)', () => {
    expect(isValidCustomCompilePromptRow({ ...validRow, description: '' })).toBe(true)
  })

  it('rejects non-positive timestamps', () => {
    expect(isValidCustomCompilePromptRow({ ...validRow, createdAt: 0 })).toBe(false)
    expect(isValidCustomCompilePromptRow({ ...validRow, updatedAt: -1 })).toBe(false)
  })

  it('rejects infinite timestamps', () => {
    expect(isValidCustomCompilePromptRow({ ...validRow, createdAt: Infinity })).toBe(false)
  })
})
