import { describe, it, expect } from 'vitest'
import {
  validatePersonaInput,
  generateCustomPersonaId,
  toPersona,
  MAX_PERSONA_NAME_LENGTH,
  MAX_PERSONA_CONTENT_LENGTH,
} from './persona-validators'

/**
 * Tests for the persona create-form validation + ID generation helpers.
 *
 * These are pure functions — no React, no IPC, no disk. The tests verify
 * the contract that the form UI relies on (which fields produce errors,
 * what messages they produce, what shape the IDs take), and pin a few
 * regression cases that could otherwise creep in if a future refactor
 * loosens the validation accidentally.
 */

describe('validatePersonaInput', () => {
  describe('name validation', () => {
    it('accepts a normal name and empty content', () => {
      expect(validatePersonaInput('Tech Lead', '')).toEqual([])
    })

    it('accepts a normal name with non-trivial content', () => {
      expect(validatePersonaInput('Tech Lead', 'You are a thoughtful tech lead.')).toEqual([])
    })

    it('rejects an empty name', () => {
      const errors = validatePersonaInput('', '')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.field).toBe('name')
      expect(errors[0]?.message).toMatch(/required/i)
    })

    it('rejects a whitespace-only name (treated as empty after trim)', () => {
      const errors = validatePersonaInput('   ', '')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.field).toBe('name')
    })

    it('accepts a name at exactly the max length', () => {
      const name = 'a'.repeat(MAX_PERSONA_NAME_LENGTH)
      expect(validatePersonaInput(name, '')).toEqual([])
    })

    it('rejects a name one character over the max length', () => {
      const name = 'a'.repeat(MAX_PERSONA_NAME_LENGTH + 1)
      const errors = validatePersonaInput(name, '')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.field).toBe('name')
      expect(errors[0]?.message).toMatch(new RegExp(String(MAX_PERSONA_NAME_LENGTH)))
    })

    it('measures length on the trimmed name (leading/trailing space does not count)', () => {
      // 30 chars surrounded by spaces — total length 32 — should still be valid
      const name = `  ${'a'.repeat(MAX_PERSONA_NAME_LENGTH)}  `
      expect(validatePersonaInput(name, '')).toEqual([])
    })
  })

  describe('content validation', () => {
    it('accepts empty content (interpreted as no special instructions)', () => {
      expect(validatePersonaInput('Name', '')).toEqual([])
    })

    it('accepts content at exactly the max length', () => {
      const content = 'x'.repeat(MAX_PERSONA_CONTENT_LENGTH)
      expect(validatePersonaInput('Name', content)).toEqual([])
    })

    it('rejects content one character over the max length', () => {
      const content = 'x'.repeat(MAX_PERSONA_CONTENT_LENGTH + 1)
      const errors = validatePersonaInput('Name', content)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.field).toBe('content')
    })
  })

  describe('multiple errors', () => {
    it('returns all errors in a single call (does not stop at the first one)', () => {
      const errors = validatePersonaInput('', 'x'.repeat(MAX_PERSONA_CONTENT_LENGTH + 1))
      // One error for empty name, one for oversized content
      expect(errors).toHaveLength(2)
      const fields = errors.map((e) => e.field)
      expect(fields).toContain('name')
      expect(fields).toContain('content')
    })
  })
})

describe('generateCustomPersonaId', () => {
  it('generates an ID with the custom_ prefix', () => {
    expect(generateCustomPersonaId('Tech Lead', 1700000000000)).toMatch(/^custom_/)
  })

  it('slugifies the name into the middle segment', () => {
    expect(generateCustomPersonaId('Tech Lead', 1700000000000)).toContain('tech-lead')
  })

  it('lowercases mixed-case names', () => {
    expect(generateCustomPersonaId('TechLead', 1700000000000)).toContain('techlead')
  })

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(generateCustomPersonaId("Devil's Advocate!", 1700000000000)).toContain('devil-s-advocate')
  })

  it('strips leading and trailing hyphens from the slug', () => {
    expect(generateCustomPersonaId('!!Lead!!', 1700000000000)).toMatch(/custom_lead_\d{6}/)
  })

  it('caps the slug at 24 characters even for long names', () => {
    const id = generateCustomPersonaId('a'.repeat(50), 1700000000000)
    // Format: custom_{slug}_{6-digit suffix}
    const slug = id.replace(/^custom_/, '').replace(/_\d{6}$/, '')
    expect(slug.length).toBeLessThanOrEqual(24)
  })

  it('uses the last 6 digits of the timestamp as the suffix', () => {
    expect(generateCustomPersonaId('Test', 1700000123456)).toBe('custom_test_123456')
  })

  it('falls back to "persona" with a random suffix when the slug is empty', () => {
    // Random suffix is provided as a test seed for determinism. Without
    // the seed, generateCustomPersonaId would call Math.random().
    expect(generateCustomPersonaId('!!!', 1700000000000, 'abcd')).toBe('custom_persona_000000_abcd')
    expect(generateCustomPersonaId('   ', 1700000000000, 'abcd')).toBe('custom_persona_000000_abcd')
  })

  it('produces different IDs for two empty-slug names in the same millisecond when randomSeed differs', () => {
    // Real-world scenario: user creates two personas named "🤖" and "测试"
    // in the same millisecond. Both slug to "persona", but the random
    // suffix differentiates them.
    const a = generateCustomPersonaId('🤖', 1700000000000, 'aaaa')
    const b = generateCustomPersonaId('测试', 1700000000000, 'bbbb')
    expect(a).not.toBe(b)
  })

  it('does NOT add a random suffix when the slug is non-empty (keeps ASCII IDs deterministic)', () => {
    expect(generateCustomPersonaId('Tech Lead', 1700000000000, 'wxyz')).toBe('custom_tech-lead_000000')
  })

  it('produces different IDs for the same name at different timestamps', () => {
    const a = generateCustomPersonaId('Same', 1700000000001)
    const b = generateCustomPersonaId('Same', 1700000000002)
    expect(a).not.toBe(b)
  })

  it('is deterministic for the same name and timestamp', () => {
    const a = generateCustomPersonaId('Determined', 1700000000000)
    const b = generateCustomPersonaId('Determined', 1700000000000)
    expect(a).toBe(b)
  })
})

describe('toPersona', () => {
  it('synthesizes a Persona with isBuiltIn false', () => {
    const result = toPersona({ id: 'custom_test_123456', name: 'Test', content: 'body' })
    expect(result.isBuiltIn).toBe(false)
  })

  it('passes through id, name, and content unchanged', () => {
    const result = toPersona({ id: 'custom_test_123456', name: 'Test', content: 'body content' })
    expect(result.id).toBe('custom_test_123456')
    expect(result.name).toBe('Test')
    expect(result.content).toBe('body content')
  })

  it('sets a synthetic __custom__/ filePath', () => {
    const result = toPersona({ id: 'custom_test_123456', name: 'Test', content: '' })
    expect(result.filePath).toBe('__custom__/custom_test_123456.md')
  })

  it('synthetic filePath uses the persona id, not the name', () => {
    // Important: if the user renames a custom persona, the ID is stable
    // but the name is not — the filePath must track the ID so existing
    // references don't break.
    const result = toPersona({ id: 'custom_oldname_111111', name: 'New Name', content: '' })
    expect(result.filePath).toContain('custom_oldname_111111')
    expect(result.filePath).not.toContain('new-name')
  })
})
