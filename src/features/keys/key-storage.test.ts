import { describe, it, expect } from 'vitest'
import { createApiKeyEntry, parseEnvToKeys, keysToEnv } from './key-storage'
import type { ApiKey } from '@/types'

// ------------------------------------------------------------------
// Shared key fixtures
// ------------------------------------------------------------------
const ANTHROPIC_RAW = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'
const OPENAI_RAW = 'sk-proj-abcdefghijklmnopqrstuvwxyz'
const GOOGLE_RAW = 'AIzaSyabcdefghijklmnopqrstuvwxyzABCD'
const XAI_RAW = 'xai-abcdefghijklmnopqrstuvwxyz123456'
const DEEPSEEK_RAW = 'sk-abcdefghijklmnopqrstuvwxyz'

describe('createApiKeyEntry', () => {
  describe('invalid / empty input', () => {
    it('returns null for an empty string', () => {
      expect(createApiKeyEntry('')).toBeNull()
    })

    it('returns null for a whitespace-only string', () => {
      expect(createApiKeyEntry('   ')).toBeNull()
    })

    it('returns null when the key has no detectable provider and no override is supplied', () => {
      expect(createApiKeyEntry('totally-unknown-key-format')).toBeNull()
    })
  })

  describe('auto-detection from key prefix', () => {
    it('detects anthropic from sk-ant- prefix', () => {
      const entry = createApiKeyEntry(ANTHROPIC_RAW)
      expect(entry?.provider).toBe('anthropic')
    })

    it('detects openai from sk-proj- prefix', () => {
      const entry = createApiKeyEntry(OPENAI_RAW)
      expect(entry?.provider).toBe('openai')
    })

    it('detects google from AIza prefix', () => {
      const entry = createApiKeyEntry(GOOGLE_RAW)
      expect(entry?.provider).toBe('google')
    })

    it('detects xai from xai- prefix', () => {
      const entry = createApiKeyEntry(XAI_RAW)
      expect(entry?.provider).toBe('xai')
    })

    it('detects deepseek from bare sk- prefix', () => {
      const entry = createApiKeyEntry(DEEPSEEK_RAW)
      expect(entry?.provider).toBe('deepseek')
    })
  })

  describe('provider override', () => {
    it('uses the override provider even when auto-detection would succeed', () => {
      const entry = createApiKeyEntry(ANTHROPIC_RAW, 'openai')
      expect(entry?.provider).toBe('openai')
    })

    it('uses the override provider when the key has no detectable prefix', () => {
      const entry = createApiKeyEntry('totally-unknown-key-format', 'google')
      expect(entry?.provider).toBe('google')
    })

    it('returns null for an empty key even with a provider override', () => {
      expect(createApiKeyEntry('', 'anthropic')).toBeNull()
    })
  })

  describe('returned entry shape', () => {
    it('includes id, provider, maskedKey, and createdAt', () => {
      const before = Date.now()
      const entry = createApiKeyEntry(ANTHROPIC_RAW)
      const after = Date.now()

      expect(entry).not.toBeNull()
      if (entry === null) return // narrow type

      expect(typeof entry.id).toBe('string')
      expect(entry.id.length).toBeGreaterThan(0)
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      expect(entry.provider).toBe('anthropic')
      expect(typeof entry.maskedKey).toBe('string')
      expect(entry.maskedKey).toContain('••••••••')
      expect(entry.createdAt).toBeGreaterThanOrEqual(before)
      expect(entry.createdAt).toBeLessThanOrEqual(after)
    })

    it('never exposes the raw key in the returned entry', () => {
      const entry = createApiKeyEntry(ANTHROPIC_RAW)
      expect(JSON.stringify(entry)).not.toContain(ANTHROPIC_RAW)
    })

    it('generates unique ids for successive calls with the same key', () => {
      const a = createApiKeyEntry(ANTHROPIC_RAW)
      const b = createApiKeyEntry(ANTHROPIC_RAW)
      expect(a?.id).not.toBe(b?.id)
    })
  })
})

describe('parseEnvToKeys', () => {
  describe('filtering by key prefix', () => {
    it('ignores env vars that do not start with CONSILIUM_KEY_', () => {
      const env = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        OPENAI_API_KEY: OPENAI_RAW,
      }
      expect(parseEnvToKeys(env)).toHaveLength(0)
    })

    it('processes a single valid CONSILIUM_KEY_ entry', () => {
      const env = { CONSILIUM_KEY_ANTHROPIC_1: ANTHROPIC_RAW }
      const keys = parseEnvToKeys(env)
      expect(keys).toHaveLength(1)
      expect(keys[0]?.provider).toBe('anthropic')
    })

    it('processes multiple valid entries', () => {
      const env = {
        CONSILIUM_KEY_ANTHROPIC_1: ANTHROPIC_RAW,
        CONSILIUM_KEY_OPENAI_1: OPENAI_RAW,
      }
      const keys = parseEnvToKeys(env)
      expect(keys).toHaveLength(2)
    })
  })

  describe('provider extraction from env var name', () => {
    it('extracts google as provider from CONSILIUM_KEY_GOOGLE_1', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_GOOGLE_1: GOOGLE_RAW })
      expect(keys[0]?.provider).toBe('google')
    })

    it('extracts xai as provider from CONSILIUM_KEY_XAI_1', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_XAI_1: XAI_RAW })
      expect(keys[0]?.provider).toBe('xai')
    })

    it('extracts deepseek as provider from CONSILIUM_KEY_DEEPSEEK_1', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_DEEPSEEK_1: DEEPSEEK_RAW })
      expect(keys[0]?.provider).toBe('deepseek')
    })
  })

  describe('skipping invalid entries', () => {
    it('skips an entry with an unrecognised provider segment', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_UNKNOWN_1: ANTHROPIC_RAW })
      expect(keys).toHaveLength(0)
    })

    it('skips an entry with an empty value', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_ANTHROPIC_1: '' })
      expect(keys).toHaveLength(0)
    })

    it('skips an entry with a whitespace-only value', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_ANTHROPIC_1: '   ' })
      expect(keys).toHaveLength(0)
    })

    it('returns an empty array for an empty env object', () => {
      expect(parseEnvToKeys({})).toHaveLength(0)
    })
  })

  describe('returned entry shape', () => {
    it('each returned entry has the expected fields', () => {
      const keys = parseEnvToKeys({ CONSILIUM_KEY_OPENAI_1: OPENAI_RAW })
      const key = keys[0]
      expect(key).toBeDefined()
      if (key === undefined) return
      expect(typeof key.id).toBe('string')
      expect(key.maskedKey).toContain('••••••••')
      expect(typeof key.createdAt).toBe('number')
    })
  })
})

describe('keysToEnv', () => {
  // Build a minimal ApiKey fixture (maskedKey is what gets stored in env for
  // display; keysToEnv writes the rawKeys map value, not maskedKey).
  function makeKey(overrides: Partial<ApiKey> & { id: string; provider: ApiKey['provider'] }): ApiKey {
    return {
      maskedKey: 'sk-a••••••••wxyz',
      createdAt: Date.now(),
      verified: false,
      ...overrides,
    }
  }

  describe('basic mapping', () => {
    it('returns an empty object when keys array is empty', () => {
      expect(keysToEnv([], {})).toEqual({})
    })

    it('returns an empty object when no key ids appear in rawKeys', () => {
      const key = makeKey({ id: 'key_1', provider: 'anthropic' })
      expect(keysToEnv([key], {})).toEqual({})
    })

    it('maps a single key to CONSILIUM_KEY_PROVIDER_1', () => {
      const key = makeKey({ id: 'key_1', provider: 'anthropic' })
      const result = keysToEnv([key], { key_1: ANTHROPIC_RAW })
      expect(result).toEqual({ CONSILIUM_KEY_ANTHROPIC_1: ANTHROPIC_RAW })
    })

    it('uses the raw value from rawKeys, not the maskedKey', () => {
      const key = makeKey({ id: 'key_1', provider: 'openai' })
      const result = keysToEnv([key], { key_1: OPENAI_RAW })
      expect(result['CONSILIUM_KEY_OPENAI_1']).toBe(OPENAI_RAW)
      expect(result['CONSILIUM_KEY_OPENAI_1']).not.toContain('••••••••')
    })
  })

  describe('counting multiple keys per provider', () => {
    it('numbers two keys from the same provider as _1 and _2', () => {
      const k1 = makeKey({ id: 'id_1', provider: 'anthropic' })
      const k2 = makeKey({ id: 'id_2', provider: 'anthropic' })
      const rawKeys = { id_1: ANTHROPIC_RAW, id_2: 'sk-ant-second-key-abcdefghijklmnopqrst' }
      const result = keysToEnv([k1, k2], rawKeys)
      expect(result['CONSILIUM_KEY_ANTHROPIC_1']).toBe(rawKeys['id_1'])
      expect(result['CONSILIUM_KEY_ANTHROPIC_2']).toBe(rawKeys['id_2'])
    })

    it('counts providers independently (anthropic _1 and openai _1 coexist)', () => {
      const ant = makeKey({ id: 'ant_1', provider: 'anthropic' })
      const oai = makeKey({ id: 'oai_1', provider: 'openai' })
      const rawKeys = { ant_1: ANTHROPIC_RAW, oai_1: OPENAI_RAW }
      const result = keysToEnv([ant, oai], rawKeys)
      expect(Object.keys(result)).toHaveLength(2)
      expect(result['CONSILIUM_KEY_ANTHROPIC_1']).toBe(ANTHROPIC_RAW)
      expect(result['CONSILIUM_KEY_OPENAI_1']).toBe(OPENAI_RAW)
    })
  })

  describe('skipping keys with no raw value', () => {
    it('omits a key whose id is not present in rawKeys', () => {
      const present = makeKey({ id: 'present', provider: 'xai' })
      const missing = makeKey({ id: 'missing', provider: 'xai' })
      const result = keysToEnv([present, missing], { present: XAI_RAW })
      expect(result['CONSILIUM_KEY_XAI_1']).toBe(XAI_RAW)
      expect(Object.keys(result)).toHaveLength(1)
    })

    it('still increments the count for a key even when it is skipped (counter reflects order, not presence)', () => {
      // The counter ticks regardless of whether rawKey is present, so the
      // second key that IS present gets the number 2.
      const missing = makeKey({ id: 'missing', provider: 'anthropic' })
      const present = makeKey({ id: 'present', provider: 'anthropic' })
      const result = keysToEnv([missing, present], { present: ANTHROPIC_RAW })
      // missing is count=1 (no entry), present is count=2
      expect(result['CONSILIUM_KEY_ANTHROPIC_2']).toBe(ANTHROPIC_RAW)
    })
  })

  describe('env var naming convention', () => {
    it('uppercases the provider name in the env var', () => {
      const key = makeKey({ id: 'g1', provider: 'google' })
      const result = keysToEnv([key], { g1: GOOGLE_RAW })
      expect(Object.keys(result)[0]).toBe('CONSILIUM_KEY_GOOGLE_1')
    })

    it('handles deepseek provider name correctly', () => {
      const key = makeKey({ id: 'ds1', provider: 'deepseek' })
      const result = keysToEnv([key], { ds1: DEEPSEEK_RAW })
      expect(Object.keys(result)[0]).toBe('CONSILIUM_KEY_DEEPSEEK_1')
    })
  })
})
