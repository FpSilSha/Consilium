import { describe, it, expect } from 'vitest'
import { parsePersonaFile, sortPersonas } from './persona-loader'
import type { Persona } from '@/types'

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function makePersona(overrides: Partial<Persona> & { id: string; name: string }): Persona {
  return {
    filePath: 'personas/fixture.md',
    content: '',
    isBuiltIn: false,
    ...overrides,
  }
}

describe('parsePersonaFile', () => {
  describe('id generation from filePath', () => {
    it('prefixes the id with persona_', () => {
      const p = parsePersonaFile('simple', '', false)
      expect(p.id.startsWith('persona_')).toBe(true)
    })

    it('replaces forward slashes with underscores', () => {
      const p = parsePersonaFile('personas/my-persona.md', '', false)
      expect(p.id).toBe('persona_personas_my_persona_md')
    })

    it('replaces dots with underscores', () => {
      const p = parsePersonaFile('file.name.md', '', false)
      expect(p.id).toBe('persona_file_name_md')
    })

    it('replaces hyphens with underscores', () => {
      const p = parsePersonaFile('my-persona', '', false)
      expect(p.id).toBe('persona_my_persona')
    })

    it('keeps alphanumeric characters unchanged', () => {
      const p = parsePersonaFile('abc123', '', false)
      expect(p.id).toBe('persona_abc123')
    })

    it('replaces backslashes (Windows paths) with underscores', () => {
      const p = parsePersonaFile('personas\\my-persona.md', '', false)
      expect(p.id).toBe('persona_personas_my_persona_md')
    })

    it('replaces spaces in the file path with underscores', () => {
      const p = parsePersonaFile('my persona.md', '', false)
      expect(p.id).toBe('persona_my_persona_md')
    })
  })

  describe('name extraction — heading wins', () => {
    it('uses the text from the first # heading as the name', () => {
      const content = '# My Great Persona\n\nSome body text.'
      const p = parsePersonaFile('path/irrelevant.md', content, false)
      expect(p.name).toBe('My Great Persona')
    })

    it('trims whitespace from the extracted heading', () => {
      const content = '#   Padded Heading   \n'
      const p = parsePersonaFile('path/irrelevant.md', content, false)
      expect(p.name).toBe('Padded Heading')
    })

    it('ignores ## and deeper headings; only # matches', () => {
      const content = '## Section Heading\n\n# Correct Heading'
      const p = parsePersonaFile('path/irrelevant.md', content, false)
      // The regex is multiline so it matches the first # at start of a line.
      // '## Section Heading' starts the file — the regex /^#\s+/m would match
      // '# Correct Heading' because ## does NOT satisfy /^#\s+/ (space required).
      expect(p.name).toBe('Correct Heading')
    })

    it('picks the first # heading when multiple exist', () => {
      const content = '# First Heading\n\n# Second Heading'
      const p = parsePersonaFile('path/irrelevant.md', content, false)
      expect(p.name).toBe('First Heading')
    })
  })

  describe('name extraction — filename fallback', () => {
    it('uses filename without .md extension when content has no heading', () => {
      const p = parsePersonaFile('personas/my-persona.md', 'No heading here.', false)
      expect(p.name).toBe('my persona')
    })

    it('replaces hyphens with spaces in the fallback name', () => {
      const p = parsePersonaFile('some-long-name.md', '', false)
      expect(p.name).toBe('some long name')
    })

    it('replaces underscores with spaces in the fallback name', () => {
      const p = parsePersonaFile('snake_case_name.md', '', false)
      expect(p.name).toBe('snake case name')
    })

    it('strips .md extension case-insensitively', () => {
      const p = parsePersonaFile('MyPersona.MD', '', false)
      expect(p.name).toBe('MyPersona')
    })

    it('uses the last path segment as the filename base', () => {
      const p = parsePersonaFile('deep/nested/path/advisor.md', '', false)
      expect(p.name).toBe('advisor')
    })

    it('falls back gracefully when the filePath has no directory separator', () => {
      const p = parsePersonaFile('standalone.md', '', false)
      expect(p.name).toBe('standalone')
    })
  })

  describe('passthrough fields', () => {
    it('preserves filePath exactly as supplied', () => {
      const p = parsePersonaFile('personas/test.md', '', false)
      expect(p.filePath).toBe('personas/test.md')
    })

    it('preserves content exactly as supplied', () => {
      const content = '# Heading\n\nBody with **markdown**.'
      const p = parsePersonaFile('test.md', content, false)
      expect(p.content).toBe(content)
    })

    it('preserves isBuiltIn = true', () => {
      const p = parsePersonaFile('builtin/advisor.md', '# Advisor', true)
      expect(p.isBuiltIn).toBe(true)
    })

    it('preserves isBuiltIn = false', () => {
      const p = parsePersonaFile('custom/advisor.md', '# Advisor', false)
      expect(p.isBuiltIn).toBe(false)
    })
  })
})

describe('sortPersonas', () => {
  describe('built-ins come before non-built-ins', () => {
    it('places a built-in persona ahead of a custom one regardless of name order', () => {
      const personas = [
        makePersona({ id: 'p1', name: 'Zebra', isBuiltIn: false }),
        makePersona({ id: 'p2', name: 'Alpha', isBuiltIn: true }),
      ]
      const sorted = sortPersonas(personas)
      expect(sorted[0]?.name).toBe('Alpha')
      expect(sorted[1]?.name).toBe('Zebra')
    })

    it('places all built-ins before all custom personas', () => {
      const personas = [
        makePersona({ id: 'c1', name: 'Custom A', isBuiltIn: false }),
        makePersona({ id: 'b1', name: 'Built Z', isBuiltIn: true }),
        makePersona({ id: 'c2', name: 'Custom B', isBuiltIn: false }),
        makePersona({ id: 'b2', name: 'Built A', isBuiltIn: true }),
      ]
      const sorted = sortPersonas(personas)
      const builtInSection = sorted.filter(p => p.isBuiltIn)
      const customSection = sorted.filter(p => !p.isBuiltIn)
      const builtInIndices = builtInSection.map(p => sorted.indexOf(p))
      const customIndices = customSection.map(p => sorted.indexOf(p))
      expect(Math.max(...builtInIndices)).toBeLessThan(Math.min(...customIndices))
    })
  })

  describe('alphabetical order within each group', () => {
    it('sorts built-ins alphabetically among themselves', () => {
      const personas = [
        makePersona({ id: 'b1', name: 'Zebra', isBuiltIn: true }),
        makePersona({ id: 'b2', name: 'Alpha', isBuiltIn: true }),
        makePersona({ id: 'b3', name: 'Mango', isBuiltIn: true }),
      ]
      const sorted = sortPersonas(personas)
      expect(sorted.map(p => p.name)).toEqual(['Alpha', 'Mango', 'Zebra'])
    })

    it('sorts custom personas alphabetically among themselves', () => {
      const personas = [
        makePersona({ id: 'c1', name: 'Zeta', isBuiltIn: false }),
        makePersona({ id: 'c2', name: 'Beta', isBuiltIn: false }),
        makePersona({ id: 'c3', name: 'Alpha', isBuiltIn: false }),
      ]
      const sorted = sortPersonas(personas)
      expect(sorted.map(p => p.name)).toEqual(['Alpha', 'Beta', 'Zeta'])
    })
  })

  describe('immutability', () => {
    it('does not mutate the original array', () => {
      const personas = [
        makePersona({ id: 'c1', name: 'Zeta', isBuiltIn: false }),
        makePersona({ id: 'b1', name: 'Alpha', isBuiltIn: true }),
      ]
      const originalOrder = personas.map(p => p.id)
      sortPersonas(personas)
      expect(personas.map(p => p.id)).toEqual(originalOrder)
    })

    it('returns a new array reference', () => {
      const personas = [makePersona({ id: 'p1', name: 'Only', isBuiltIn: false })]
      const sorted = sortPersonas(personas)
      expect(sorted).not.toBe(personas)
    })
  })

  describe('edge cases', () => {
    it('returns an empty array when given an empty array', () => {
      expect(sortPersonas([])).toHaveLength(0)
    })

    it('returns the single element unchanged when given a one-element array', () => {
      const personas = [makePersona({ id: 'p1', name: 'Solo', isBuiltIn: false })]
      const sorted = sortPersonas(personas)
      expect(sorted).toHaveLength(1)
      expect(sorted[0]?.name).toBe('Solo')
    })

    it('handles personas with identical names without throwing', () => {
      const personas = [
        makePersona({ id: 'p1', name: 'Same', isBuiltIn: false }),
        makePersona({ id: 'p2', name: 'Same', isBuiltIn: false }),
      ]
      expect(() => sortPersonas(personas)).not.toThrow()
      expect(sortPersonas(personas)).toHaveLength(2)
    })

    it('is stable with respect to locale-sensitive names (uses localeCompare)', () => {
      // Just verifies the sort completes without error for names with accents
      const personas = [
        makePersona({ id: 'p1', name: 'Éclair', isBuiltIn: false }),
        makePersona({ id: 'p2', name: 'Apple', isBuiltIn: false }),
      ]
      const sorted = sortPersonas(personas)
      expect(sorted).toHaveLength(2)
    })
  })
})
