import { describe, it, expect } from 'vitest'
import { detectProvider, maskKey, redactKeys } from './key-detection'

// Helpers for building keys that pass the minimum-length requirements used by
// redactKeys regex patterns (20+ or 30+ suffix characters depending on provider).
const repeat = (char: string, n: number) => char.repeat(n)
const suffix20 = repeat('a', 20)
const suffix30 = repeat('a', 30)

describe('detectProvider', () => {
  describe('returns null for empty / whitespace input', () => {
    it('returns null for an empty string', () => {
      expect(detectProvider('')).toBeNull()
    })

    it('returns null for a string containing only spaces', () => {
      expect(detectProvider('   ')).toBeNull()
    })

    it('returns null for a tab-only string', () => {
      expect(detectProvider('\t\n')).toBeNull()
    })
  })

  describe('returns null for unrecognised prefixes', () => {
    it('returns null when the key has no known prefix', () => {
      expect(detectProvider('unknown-key-abc123')).toBeNull()
    })

    it('returns null for a random alphanumeric string', () => {
      expect(detectProvider('abcdef1234567890')).toBeNull()
    })
  })

  describe('anthropic keys', () => {
    it('detects sk-ant- prefix as anthropic with high confidence', () => {
      const result = detectProvider('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
      expect(result).toEqual({ provider: 'anthropic', confidence: 'high' })
    })

    it('trims leading whitespace before matching', () => {
      const result = detectProvider('  sk-ant-key')
      expect(result).toEqual({ provider: 'anthropic', confidence: 'high' })
    })

    it('trims trailing whitespace before matching', () => {
      const result = detectProvider('sk-ant-key  ')
      expect(result).toEqual({ provider: 'anthropic', confidence: 'high' })
    })
  })

  describe('openai keys', () => {
    it('detects sk-proj- prefix as openai with high confidence', () => {
      const result = detectProvider('sk-proj-abcdefghijklmnop')
      expect(result).toEqual({ provider: 'openai', confidence: 'high' })
    })
  })

  describe('google keys', () => {
    it('detects AIza prefix as google with high confidence', () => {
      const result = detectProvider('AIzaSyAbcdefghijklmnop')
      expect(result).toEqual({ provider: 'google', confidence: 'high' })
    })
  })

  describe('xai keys', () => {
    it('detects xai- prefix as xai with high confidence', () => {
      const result = detectProvider('xai-abcdefghijklmnopqrst')
      expect(result).toEqual({ provider: 'xai', confidence: 'high' })
    })
  })

  describe('deepseek keys', () => {
    it('detects sk- prefix (not sk-ant- or sk-proj-) as deepseek with ambiguous confidence', () => {
      const result = detectProvider('sk-abcdefghijklmnopqrst')
      expect(result).toEqual({ provider: 'deepseek', confidence: 'ambiguous' })
    })
  })

  describe('prefix ordering — more specific prefixes win', () => {
    it('sk-ant- is matched as anthropic, not deepseek (sk- is a substring)', () => {
      const result = detectProvider('sk-ant-some-key')
      expect(result?.provider).toBe('anthropic')
    })

    it('sk-proj- is matched as openai, not deepseek', () => {
      const result = detectProvider('sk-proj-some-key')
      expect(result?.provider).toBe('openai')
    })
  })
})

describe('maskKey', () => {
  describe('short keys (8 characters or fewer)', () => {
    it('returns bullet placeholder for an 8-character key', () => {
      expect(maskKey('12345678')).toBe('••••••••')
    })

    it('returns bullet placeholder for a 1-character key', () => {
      expect(maskKey('x')).toBe('••••••••')
    })

    it('returns bullet placeholder for an empty string', () => {
      expect(maskKey('')).toBe('••••••••')
    })

    it('returns bullet placeholder for exactly 8 characters after trimming', () => {
      // length after trim is 8 → short path
      expect(maskKey('abcdefgh')).toBe('••••••••')
    })
  })

  describe('longer keys (more than 8 characters)', () => {
    it('shows first 4 chars, bullets, then last 4 chars for a 9-character key', () => {
      expect(maskKey('abcde1234')).toBe('abcd••••••••1234')
    })

    it('shows first 4 and last 4 for a typical Anthropic key', () => {
      const key = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const result = maskKey(key)
      expect(result.startsWith('sk-a')).toBe(true)
      expect(result.endsWith('WXYZ')).toBe(true)
      expect(result).toContain('••••••••')
    })

    it('trims the key before masking', () => {
      // '  abcde1234  ' trimmed is 'abcde1234' (9 chars → long path)
      expect(maskKey('  abcde1234  ')).toBe('abcd••••••••1234')
    })

    it('produces the same middle bullets regardless of key length beyond 8', () => {
      const short9 = maskKey('123456789')
      const long20 = maskKey('12345678901234567890')
      // Both should contain exactly '••••••••'
      const bulletCount = (s: string) => (s.match(/•/g) ?? []).length
      expect(bulletCount(short9)).toBe(8)
      expect(bulletCount(long20)).toBe(8)
    })
  })
})

describe('redactKeys', () => {
  describe('text with no API keys', () => {
    it('returns the original string when there are no key patterns', () => {
      const text = 'Hello, this is a normal sentence.'
      expect(redactKeys(text)).toBe(text)
    })

    it('returns an empty string unchanged', () => {
      expect(redactKeys('')).toBe('')
    })
  })

  describe('anthropic key patterns', () => {
    it('redacts an sk-ant- key embedded in text', () => {
      const key = `sk-ant-${suffix20}`
      const text = `My key is ${key} and it is secret.`
      expect(redactKeys(text)).toBe('My key is [REDACTED] and it is secret.')
    })

    it('does not redact sk-ant- followed by fewer than 20 suffix characters', () => {
      const text = 'sk-ant-tooshort'
      // Fewer than 20 chars after prefix — should not match
      expect(redactKeys(text)).toBe(text)
    })
  })

  describe('openai key patterns', () => {
    it('redacts an sk-proj- key', () => {
      const key = `sk-proj-${suffix20}`
      expect(redactKeys(`token=${key}`)).toBe('token=[REDACTED]')
    })
  })

  describe('generic sk- key patterns (deepseek / legacy openai)', () => {
    it('redacts a bare sk- key with 20+ suffix characters', () => {
      const key = `sk-${suffix20}`
      expect(redactKeys(key)).toBe('[REDACTED]')
    })

    it('does not redact sk- with fewer than 20 suffix characters', () => {
      const text = 'sk-short'
      expect(redactKeys(text)).toBe(text)
    })
  })

  describe('google AIza key patterns', () => {
    it('redacts an AIza key with 30+ suffix characters', () => {
      const key = `AIza${suffix30}`
      expect(redactKeys(key)).toBe('[REDACTED]')
    })

    it('does not redact AIza followed by fewer than 30 suffix characters', () => {
      const text = 'AIzatooshort'
      expect(redactKeys(text)).toBe(text)
    })
  })

  describe('xai key patterns', () => {
    it('redacts an xai- key with 20+ suffix characters', () => {
      const key = `xai-${suffix20}`
      expect(redactKeys(key)).toBe('[REDACTED]')
    })
  })

  describe('multiple keys in one string', () => {
    it('redacts all occurrences when the same pattern appears twice', () => {
      const key = `sk-ant-${suffix20}`
      const text = `first=${key} second=${key}`
      expect(redactKeys(text)).toBe('first=[REDACTED] second=[REDACTED]')
    })

    it('redacts keys from different providers in the same string', () => {
      const antKey = `sk-ant-${suffix20}`
      const xaiKey = `xai-${suffix20}`
      const text = `ant=${antKey} xai=${xaiKey}`
      const result = redactKeys(text)
      expect(result).toBe('ant=[REDACTED] xai=[REDACTED]')
    })
  })

  describe('edge cases', () => {
    it('handles keys with underscores and hyphens in the suffix', () => {
      const key = `sk-ant-${'abc_DEF-123'.repeat(2)}` // 22 chars suffix
      const result = redactKeys(key)
      expect(result).toBe('[REDACTED]')
    })

    it('does not modify surrounding non-key text', () => {
      const key = `sk-ant-${suffix20}`
      const text = `prefix ${key} suffix`
      const result = redactKeys(text)
      expect(result.startsWith('prefix ')).toBe(true)
      expect(result.endsWith(' suffix')).toBe(true)
    })
  })
})
