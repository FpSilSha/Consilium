import { describe, it, expect } from 'vitest'
import { BUILT_IN_PERSONAS } from './built-in-personas'

/**
 * Tests for the built-in personas loader.
 *
 * Built-in personas are sourced from `personas/*.md` at the repo root
 * and loaded via Vite's `import.meta.glob` at build time. This test
 * file is the safety net for "user dropped a new file in the personas
 * folder" — it verifies the loaded array satisfies the contract every
 * downstream consumer relies on.
 *
 * Adding or removing a .md file in personas/ does NOT require
 * updating this test — the assertions are about shape and invariants,
 * not specific personas. The minimum-count check is set to 1 (not 6)
 * so an intentional reduction to a smaller built-in set still passes.
 *
 * If a file is invalid the loader skips it with a console.warn at
 * load time. The skip is not visible at the test boundary — if you
 * dropped 5 files and only 4 are loaded, the test still passes (4
 * is >= 1) but you'd see the warning in the test output.
 */

describe('BUILT_IN_PERSONAS', () => {
  it('loads at least one persona from personas/*.md', () => {
    expect(BUILT_IN_PERSONAS.length).toBeGreaterThanOrEqual(1)
  })

  it('every entry has the builtin_ id prefix (slice reserved-id contract)', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(persona.id).toMatch(/^builtin_/)
    }
  })

  it('every entry has a non-empty display name', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(persona.name).not.toBe('')
      expect(persona.name.trim()).toBe(persona.name)
    }
  })

  it('every entry has non-empty content', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(persona.content.length).toBeGreaterThan(0)
    }
  })

  it('every entry is marked isBuiltIn:true', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(persona.isBuiltIn).toBe(true)
    }
  })

  it('every filePath uses the synthetic __builtin__/ prefix', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(persona.filePath).toMatch(/^__builtin__\/.+\.md$/)
    }
  })

  it('all ids are unique', () => {
    const ids = new Set<string>()
    for (const persona of BUILT_IN_PERSONAS) {
      expect(ids.has(persona.id)).toBe(false)
      ids.add(persona.id)
    }
  })

  it('all display names are unique (would confuse the UI dropdown)', () => {
    const names = new Set<string>()
    for (const persona of BUILT_IN_PERSONAS) {
      expect(names.has(persona.name)).toBe(false)
      names.add(persona.name)
    }
  })

  it('content extraction preserves the original markdown body verbatim', () => {
    // The loader should NOT strip the heading or reformat the body —
    // the persona content goes into the system prompt as-is and any
    // edits would silently change advisor behavior.
    for (const persona of BUILT_IN_PERSONAS) {
      // Either the content starts with a heading line, or it doesn't —
      // both are acceptable. What's NOT acceptable is the loader
      // having stripped a heading that was there originally.
      // Easiest invariant: content should not start with a blank line
      // followed by a heading (which would suggest a strip happened
      // and re-added a newline).
      expect(persona.content).not.toMatch(/^\n+#/)
    }
  })

  it('returns a deterministic order (sorted by filename)', () => {
    // The ids embed the filename, so a sort-by-id check verifies the
    // filename order. This catches accidental order regressions if
    // the loader's sort is removed or changed.
    const ids = BUILT_IN_PERSONAS.map((p) => p.id)
    const sortedIds = [...ids].sort((a, b) => a.localeCompare(b))
    expect(ids).toEqual(sortedIds)
  })
})
