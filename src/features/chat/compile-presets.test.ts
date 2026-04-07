import { describe, it, expect } from 'vitest'
import {
  COMPILE_PRESETS,
  DEFAULT_PRESET_ID,
  getPresetById,
  isKnownPresetId,
  type CompilePreset,
} from './compile-presets'

describe('COMPILE_PRESETS', () => {
  it('contains at least one preset', () => {
    expect(COMPILE_PRESETS.length).toBeGreaterThan(0)
  })

  it('every preset has the required fields filled in', () => {
    for (const preset of COMPILE_PRESETS) {
      expect(typeof preset.id).toBe('string')
      expect(preset.id.length).toBeGreaterThan(0)
      expect(typeof preset.label).toBe('string')
      expect(preset.label.length).toBeGreaterThan(0)
      expect(typeof preset.description).toBe('string')
      expect(preset.description.length).toBeGreaterThan(0)
      expect(typeof preset.prompt).toBe('string')
      expect(preset.prompt.length).toBeGreaterThan(50) // every prompt is substantive
    }
  })

  it('every preset id is unique (no duplicate IDs)', () => {
    const ids = COMPILE_PRESETS.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('contains the DEFAULT_PRESET_ID', () => {
    const found = COMPILE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)
    expect(found).toBeDefined()
  })

  it('contains presets for the user-facing scenarios planned for v1', () => {
    // Sanity-check that the planned set of presets exists. If a preset is
    // renamed or removed in the future, this test will fail loudly so the
    // change is intentional rather than accidental.
    const ids = COMPILE_PRESETS.map((p) => p.id)
    expect(ids).toContain('comprehensive')
    expect(ids).toContain('brief')
    expect(ids).toContain('minutes')
    expect(ids).toContain('essay')
    expect(ids).toContain('qa-digest')
  })
})

describe('getPresetById', () => {
  it('returns the matching preset for a known ID', () => {
    for (const preset of COMPILE_PRESETS) {
      const result = getPresetById(preset.id)
      expect(result.id).toBe(preset.id)
      expect(result.label).toBe(preset.label)
    }
  })

  it('falls back to the default preset for an unknown ID', () => {
    const result = getPresetById('totally-made-up-preset-id')
    expect(result.id).toBe(DEFAULT_PRESET_ID)
  })

  it('falls back to the default preset for an empty string', () => {
    const result = getPresetById('')
    expect(result.id).toBe(DEFAULT_PRESET_ID)
  })

  it('returns a CompilePreset shape regardless of input', () => {
    const result: CompilePreset = getPresetById('any-string')
    expect(result.id).toBeDefined()
    expect(result.label).toBeDefined()
    expect(result.description).toBeDefined()
    expect(result.prompt).toBeDefined()
  })
})

describe('isKnownPresetId', () => {
  it('returns true for every defined preset', () => {
    for (const preset of COMPILE_PRESETS) {
      expect(isKnownPresetId(preset.id)).toBe(true)
    }
  })

  it('returns false for unknown IDs', () => {
    expect(isKnownPresetId('totally-made-up')).toBe(false)
    expect(isKnownPresetId('')).toBe(false)
    expect(isKnownPresetId('comprehensive ')).toBe(false) // trailing space
    expect(isKnownPresetId('Comprehensive')).toBe(false) // wrong case
  })

  it('returns false for non-string values', () => {
    expect(isKnownPresetId(null)).toBe(false)
    expect(isKnownPresetId(undefined)).toBe(false)
    expect(isKnownPresetId(123)).toBe(false)
    expect(isKnownPresetId({})).toBe(false)
    expect(isKnownPresetId([])).toBe(false)
  })

  it('narrows the type to string when true', () => {
    const value: unknown = 'comprehensive'
    if (isKnownPresetId(value)) {
      // TypeScript should narrow value to string here
      const length: number = value.length
      expect(length).toBeGreaterThan(0)
    }
  })
})

describe('preset prompt content invariants', () => {
  // These check the prompt design principles applied across all presets,
  // not the literal wording. If a future edit accidentally drops a key
  // principle, the test fails loudly.

  it('every preset includes an honesty / no-fabrication instruction', () => {
    for (const preset of COMPILE_PRESETS) {
      const prompt = preset.prompt.toLowerCase()
      // Look for ANY anti-fabrication phrasing — different presets word it
      // differently, so we accept several variants.
      const hasHonestyClause =
        prompt.includes('do not introduce') ||
        prompt.includes('do not invent') ||
        prompt.includes('do not fabricate') ||
        prompt.includes('do not add') ||
        prompt.includes('stay strictly within') ||
        prompt.includes('does not contain') ||
        prompt.includes("didn't contain") ||
        prompt.includes("did not contain")
      expect(hasHonestyClause).toBe(true)
    }
  })

  it('attribution-required presets explicitly say so', () => {
    // Minutes is the one preset where attribution is REQUIRED, not optional.
    const minutes = getPresetById('minutes')
    const prompt = minutes.prompt.toLowerCase()
    expect(prompt).toMatch(/attribut/i)
  })

  it('attribution-discouraged presets explicitly say so', () => {
    // Brief, essay, and qa-digest should explicitly tell the model NOT to
    // attribute (or to attribute only when meaningful).
    for (const id of ['brief', 'essay']) {
      const preset = getPresetById(id)
      const prompt = preset.prompt.toLowerCase()
      const discouragesAttribution =
        prompt.includes('do not attribute') ||
        prompt.includes("don't attribute") ||
        prompt.includes('without "[x said]"') ||
        prompt.includes('without attribution')
      expect(discouragesAttribution).toBe(true)
    }
  })
})
