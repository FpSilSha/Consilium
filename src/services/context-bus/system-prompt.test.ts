import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './system-prompt'

const SEPARATOR = '\n\n---\n\n'

// The hardcoded app-level prompt contains this distinctive substring
const APP_LEVEL_SIGNATURE = 'You are one of several AI advisors'

describe('buildSystemPrompt', () => {
  describe('layer count and structure', () => {
    it('produces exactly 2 layers (joined by one separator) without sessionInstructions', () => {
      const result = buildSystemPrompt('Persona instructions here.')
      const parts = result.split(SEPARATOR)
      expect(parts).toHaveLength(2)
    })

    it('produces exactly 3 layers (joined by two separators) with sessionInstructions', () => {
      const result = buildSystemPrompt('Persona content.', 'Session rules.')
      const parts = result.split(SEPARATOR)
      expect(parts).toHaveLength(3)
    })

    it('treats undefined sessionInstructions as absent (2 layers)', () => {
      const result = buildSystemPrompt('Persona content.', undefined)
      expect(result.split(SEPARATOR)).toHaveLength(2)
    })

    it('treats empty string sessionInstructions as absent (2 layers)', () => {
      const result = buildSystemPrompt('Persona content.', '')
      expect(result.split(SEPARATOR)).toHaveLength(2)
    })

    it('treats whitespace-only sessionInstructions as absent (2 layers)', () => {
      const result = buildSystemPrompt('Persona content.', '   \t\n  ')
      expect(result.split(SEPARATOR)).toHaveLength(2)
    })
  })

  describe('APP_LEVEL_PROMPT inclusion', () => {
    it('first layer contains the hardcoded app-level prompt text', () => {
      const result = buildSystemPrompt('Persona.')
      const firstLayer = result.split(SEPARATOR)[0]
      expect(firstLayer).toContain(APP_LEVEL_SIGNATURE)
    })

    it('app-level prompt appears in full result regardless of other inputs', () => {
      const result = buildSystemPrompt('', undefined)
      expect(result).toContain(APP_LEVEL_SIGNATURE)
    })
  })

  describe('persona content placement', () => {
    it('second layer contains the persona content', () => {
      const personaContent = 'You are a strict financial advisor.'
      const result = buildSystemPrompt(personaContent)
      const parts = result.split(SEPARATOR)
      expect(parts[1]).toBe(personaContent)
    })

    it('omits the persona layer entirely when personaContent is empty (No Persona)', () => {
      const result = buildSystemPrompt('')
      const parts = result.split(SEPARATOR)
      // Only the app-level layer remains — no trailing separator, no empty layer.
      expect(parts).toHaveLength(1)
      expect(result.endsWith(SEPARATOR)).toBe(false)
    })

    it('omits the persona layer when personaContent is whitespace-only', () => {
      const result = buildSystemPrompt('   \n\n   ')
      const parts = result.split(SEPARATOR)
      expect(parts).toHaveLength(1)
    })

    it('still appends sessionInstructions when persona is empty', () => {
      const result = buildSystemPrompt('', 'Be concise.')
      const parts = result.split(SEPARATOR)
      expect(parts).toHaveLength(2)
      expect(parts[1]).toBe('Be concise.')
    })

    it('preserves multi-line persona content exactly', () => {
      const personaContent = 'Line one.\n\nLine two.\n\nLine three.'
      const result = buildSystemPrompt(personaContent)
      expect(result).toContain(personaContent)
    })
  })

  describe('session instructions placement', () => {
    it('third layer is exactly the sessionInstructions string', () => {
      const instructions = 'Focus on tax law only.'
      const result = buildSystemPrompt('Persona.', instructions)
      const parts = result.split(SEPARATOR)
      expect(parts[2]).toBe(instructions)
    })

    it('non-empty sessionInstructions with inner whitespace are kept as-is', () => {
      const instructions = '  leading and trailing spaces  '
      const result = buildSystemPrompt('Persona.', instructions)
      const parts = result.split(SEPARATOR)
      // trim check is on the overall string, but the stored value is the original
      expect(parts[2]).toBe(instructions)
    })
  })

  describe('separator format', () => {
    it('uses exactly \\n\\n---\\n\\n as the separator', () => {
      const result = buildSystemPrompt('Persona.', 'Instructions.')
      // The separator must appear exactly twice (two joins → two occurrences)
      const separatorCount = result.split(SEPARATOR).length - 1
      expect(separatorCount).toBe(2)
    })

    it('does not introduce extra blank lines beyond the separator', () => {
      const result = buildSystemPrompt('Persona.')
      // Should not contain triple newline anywhere
      expect(result).not.toContain('\n\n\n')
    })
  })

  describe('full output integrity', () => {
    it('result starts with the app-level prompt, not the persona', () => {
      const result = buildSystemPrompt('Persona content.')
      expect(result.startsWith('You are one of several AI advisors')).toBe(true)
    })

    it('result ends with sessionInstructions when provided', () => {
      const instructions = 'Final session rule.'
      const result = buildSystemPrompt('Persona.', instructions)
      expect(result.endsWith(instructions)).toBe(true)
    })

    it('result ends with persona content when no sessionInstructions', () => {
      const persona = 'Last line of persona.'
      const result = buildSystemPrompt(persona)
      expect(result.endsWith(persona)).toBe(true)
    })
  })
})
