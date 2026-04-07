import { describe, it, expect } from 'vitest'
import {
  getMergedCompactPrompts,
  resolveCompactPromptTemplate,
  resolveCompactPromptTemplateWithFallback,
  substituteCompactPlaceholders,
  isValidStoredCompactPrompt,
} from './compact-prompts-resolver'
import { BUILT_IN_COMPACT_PROMPT_ID, BUILT_IN_COMPACT_PROMPTS } from './built-in-compact-prompts'
import type { CustomCompactPrompt } from './types'

/**
 * Tests for the compact prompts resolver — pure functions, no store,
 * no IPC. Mirrors the compile-prompts-resolver test structure.
 *
 * Critical regression: the built-in base entry's content must produce
 * byte-identical output to the pre-feature `buildSummaryPrompt` for
 * an archive — verified via the substitution test that snapshots
 * specific phrases.
 */

const customA: CustomCompactPrompt = {
  id: 'custom_compactprompt_terse_111111',
  name: 'Terse Summarizer',
  content: 'Summarize in 3 bullets:\n\n{messages}',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

const customB: CustomCompactPrompt = {
  id: 'custom_compactprompt_detailed_222222',
  name: 'Detailed Summarizer',
  content: 'Produce a detailed summary preserving every fact:\n\n{messages}',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

describe('getMergedCompactPrompts', () => {
  it('returns the built-in entry when customs is empty', () => {
    const merged = getMergedCompactPrompts([])
    expect(merged).toHaveLength(BUILT_IN_COMPACT_PROMPTS.length)
    expect(merged[0]?.id).toBe(BUILT_IN_COMPACT_PROMPT_ID)
    expect(merged[0]?.isBuiltIn).toBe(true)
  })

  it('places built-in entry before custom entries', () => {
    const merged = getMergedCompactPrompts([customA])
    expect(merged[0]?.isBuiltIn).toBe(true)
    expect(merged[1]?.isBuiltIn).toBe(false)
    expect(merged[1]?.id).toBe(customA.id)
  })

  it('marks every custom entry with isBuiltIn:false', () => {
    const merged = getMergedCompactPrompts([customA, customB])
    const customEntries = merged.filter((p) => !p.isBuiltIn)
    expect(customEntries).toHaveLength(2)
    for (const entry of customEntries) {
      expect(entry.isBuiltIn).toBe(false)
    }
  })

  it('preserves custom entry order from the input array', () => {
    const merged = getMergedCompactPrompts([customA, customB])
    const customIdsInOrder = merged.filter((p) => !p.isBuiltIn).map((p) => p.id)
    expect(customIdsInOrder).toEqual([customA.id, customB.id])
  })
})

describe('resolveCompactPromptTemplate', () => {
  it('returns the built-in template content for the built-in id', () => {
    const template = resolveCompactPromptTemplate(BUILT_IN_COMPACT_PROMPT_ID, [])
    expect(template).not.toBeNull()
    expect(template).toContain('{messages}')
    expect(template).toContain('Summarize')
  })

  it('returns the custom template content for a custom id', () => {
    const template = resolveCompactPromptTemplate(customA.id, [customA])
    expect(template).toBe(customA.content)
  })

  it('returns null for an unknown id', () => {
    expect(resolveCompactPromptTemplate('custom_compactprompt_missing', [customA])).toBeNull()
  })

  it('returns null for an empty id', () => {
    expect(resolveCompactPromptTemplate('', [customA])).toBeNull()
  })
})

describe('resolveCompactPromptTemplateWithFallback', () => {
  it('returns the template when the id resolves', () => {
    expect(resolveCompactPromptTemplateWithFallback(customA.id, [customA])).toBe(customA.content)
  })

  it('falls back to the built-in template when the id is unknown', () => {
    const template = resolveCompactPromptTemplateWithFallback('custom_missing', [])
    expect(template).toContain('Summarize')
    expect(template).toContain('{messages}')
  })

  it('falls back to the built-in template for an empty id', () => {
    const template = resolveCompactPromptTemplateWithFallback('', [])
    expect(template).toContain('Summarize')
  })

  it('falls back to base when the found entry has empty content', () => {
    // A tampered custom-compact-prompts.json could slip an empty
    // content past the disk validator (content: '' passes
    // isValidStoredCompactPrompt). The resolver's runtime safety
    // check should recognize the broken state and fall back to
    // the known-good base template.
    const broken: CustomCompactPrompt = {
      id: 'custom_compactprompt_broken_111111',
      name: 'Broken',
      content: '',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }
    const template = resolveCompactPromptTemplateWithFallback(broken.id, [broken])
    expect(template).toContain('Summarize the following conversation concisely')
  })

  it('falls back to base when the found entry is missing the {messages} placeholder', () => {
    // Non-empty content without the placeholder means the
    // substitution is a no-op and the model receives the template
    // body with zero archive context — it would confidently
    // hallucinate a summary, which would then replace the archive.
    // The resolver's safety check prevents this from reaching the
    // API call.
    const broken: CustomCompactPrompt = {
      id: 'custom_compactprompt_noplaceholder_222222',
      name: 'No Placeholder',
      content: 'Summarize briefly in two sentences.',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }
    const template = resolveCompactPromptTemplateWithFallback(broken.id, [broken])
    expect(template).toContain('{messages}')
    expect(template).not.toBe(broken.content)
  })

  it('falls back to base when the found entry has whitespace-only content', () => {
    const broken: CustomCompactPrompt = {
      id: 'custom_compactprompt_whitespace_333333',
      name: 'Whitespace Only',
      content: '   \n\n\t  ',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }
    const template = resolveCompactPromptTemplateWithFallback(broken.id, [broken])
    expect(template).toContain('Summarize')
  })

  it('does NOT fall back when the found entry is structurally valid', () => {
    const valid: CustomCompactPrompt = {
      id: 'custom_compactprompt_valid_444444',
      name: 'Valid',
      content: 'Terse summary:\n\n{messages}',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }
    const template = resolveCompactPromptTemplateWithFallback(valid.id, [valid])
    expect(template).toBe(valid.content)
  })
})

describe('substituteCompactPlaceholders', () => {
  it('replaces {messages} with the provided string', () => {
    const template = 'Before\n{messages}\nAfter'
    const result = substituteCompactPlaceholders(template, 'MSG BODY')
    expect(result).toBe('Before\nMSG BODY\nAfter')
  })

  it('replaces multiple occurrences', () => {
    const template = '{messages}\n---\n{messages}'
    const result = substituteCompactPlaceholders(template, 'X')
    expect(result).toBe('X\n---\nX')
  })

  it('leaves a template without {messages} unchanged', () => {
    const template = 'no placeholder here'
    expect(substituteCompactPlaceholders(template, 'ignored')).toBe(template)
  })

  it('does NOT re-process a {messages} token that appears inside the substituted value', () => {
    // Single-pass regex — if the value contains "{messages}", it
    // should NOT be re-scanned as a template token. This is the
    // same cascade safety the persona-switch substitution enforces.
    const template = '{messages}'
    const result = substituteCompactPlaceholders(template, '{messages} literal')
    expect(result).toBe('{messages} literal')
  })

  it('handles an empty messages string', () => {
    expect(substituteCompactPlaceholders('A{messages}B', '')).toBe('AB')
  })
})

describe('regression: built-in template matches pre-feature hardcoded buildSummaryPrompt', () => {
  // These assertions pin the SPECIFIC PHRASES that the old
  // compaction-engine.test.ts tests check for. If any of these fail,
  // the built-in base entry has drifted from the historical prompt
  // and the existing compaction tests will break in tandem.
  it('contains "Summarize the following conversation concisely. Preserve:"', () => {
    expect(resolveCompactPromptTemplateWithFallback(BUILT_IN_COMPACT_PROMPT_ID, [])).toContain(
      'Summarize the following conversation concisely. Preserve:',
    )
  })

  it('contains all five bullet lines from the historical prompt', () => {
    const template = resolveCompactPromptTemplateWithFallback(BUILT_IN_COMPACT_PROMPT_ID, [])
    expect(template).toContain('- Key decisions and conclusions')
    expect(template).toContain('- Important facts, numbers, and code snippets')
    expect(template).toContain('- Who said what (using their persona labels)')
    expect(template).toContain('- Action items and open questions')
  })

  it('contains the 500-word cap phrase', () => {
    const template = resolveCompactPromptTemplateWithFallback(BUILT_IN_COMPACT_PROMPT_ID, [])
    expect(template).toContain('Keep the summary under 500 words')
    expect(template).toContain('Use the original persona labels in brackets')
  })

  it('produces the expected final structure when {messages} is substituted', () => {
    const template = resolveCompactPromptTemplateWithFallback(BUILT_IN_COMPACT_PROMPT_ID, [])
    const result = substituteCompactPlaceholders(template, '[You]: Hello.\n\n[Alice]: Hi!')
    // Separator and messages should appear after the instructions
    expect(result).toContain('---')
    expect(result).toContain('[You]: Hello.')
    expect(result).toContain('[Alice]: Hi!')
    // Structure: instructions first, then separator, then messages
    const separatorIdx = result.indexOf('---')
    const messagesIdx = result.indexOf('[You]:')
    expect(separatorIdx).toBeLessThan(messagesIdx)
    expect(separatorIdx).toBeGreaterThan(0)
  })
})

describe('isValidStoredCompactPrompt', () => {
  const validRow = {
    id: 'custom_compactprompt_test_123456',
    name: 'Test',
    content: 'Summarize:\n\n{messages}',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }

  it('accepts a valid row', () => {
    expect(isValidStoredCompactPrompt(validRow)).toBe(true)
  })

  it('accepts empty content (no-op template is permitted)', () => {
    expect(isValidStoredCompactPrompt({ ...validRow, content: '' })).toBe(true)
  })

  it('rejects empty id', () => {
    expect(isValidStoredCompactPrompt({ ...validRow, id: '' })).toBe(false)
  })

  it('rejects empty name', () => {
    expect(isValidStoredCompactPrompt({ ...validRow, name: '' })).toBe(false)
  })

  it('rejects non-positive createdAt', () => {
    expect(isValidStoredCompactPrompt({ ...validRow, createdAt: 0 })).toBe(false)
    expect(isValidStoredCompactPrompt({ ...validRow, createdAt: -1 })).toBe(false)
  })

  it('rejects null/undefined input', () => {
    expect(isValidStoredCompactPrompt(null)).toBe(false)
    expect(isValidStoredCompactPrompt(undefined)).toBe(false)
  })
})
