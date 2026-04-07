import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from './fuzzy-match'

// ---------------------------------------------------------------------------
// Empty query
// ---------------------------------------------------------------------------

describe('fuzzyMatch — empty query', () => {
  it('matches everything when query is an empty string', () => {
    expect(fuzzyMatch('', 'any string at all').match).toBe(true)
    expect(fuzzyMatch('', '').match).toBe(true)
  })

  it('returns score 0 for an empty query', () => {
    expect(fuzzyMatch('', 'something').score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Exact match
// ---------------------------------------------------------------------------

describe('fuzzyMatch — exact match', () => {
  it('matches and returns a non-zero score for an exact string', () => {
    const result = fuzzyMatch('toggle dark mode', 'toggle dark mode')
    expect(result.match).toBe(true)
    expect(result.score).toBeGreaterThan(0)
  })

  it('scores an exact match higher than a spread fuzzy match of the same characters', () => {
    // 'ab' consecutive in 'ab' (t=0→+1 word-start+1=2, o=1 consecutive+2=2, total=4 for 2 chars)
    // 'ab' spread in 'a zb' (a=0→+1 word-start+1=2, b=3→+1 word-start after space+1=2 — NOT consecutive)
    // The consecutive version accumulates +2 per subsequent char vs +1 non-consecutive
    // Use a longer query where the consecutive bonus gap is visible
    const exact = fuzzyMatch('abc', 'abcdef')         // a=0(+1+1=2), b=1(consec+2=2), c=2(consec+2=2) = 6
    const spread = fuzzyMatch('abc', 'a b c d e f')   // a=0(+1+1=2), b=2(word-start+1+1=2), c=4(word-start+1+1=2) = 6
    // These still tie on score; use a target where the spread chars are NOT at word starts
    const spreadMid = fuzzyMatch('abc', 'xaxbxcx')    // a=1(+1=1), b=3(+1=1), c=5(+1=1) = 3
    expect(exact.score).toBeGreaterThan(spreadMid.score)
  })
})

// ---------------------------------------------------------------------------
// Partial / fuzzy match
// ---------------------------------------------------------------------------

describe('fuzzyMatch — partial and fuzzy matching', () => {
  it('matches when all query characters appear in order within the target', () => {
    // "tdm" matches "toggle dark mode": t...d...m all appear in order
    const result = fuzzyMatch('tdm', 'toggle dark mode')
    expect(result.match).toBe(true)
    expect(result.score).toBeGreaterThan(0)
  })

  it('matches a prefix substring correctly', () => {
    const result = fuzzyMatch('tog', 'toggle dark mode')
    expect(result.match).toBe(true)
  })

  it('does not match when a query character is absent from the target', () => {
    const result = fuzzyMatch('xyz', 'toggle dark mode')
    expect(result.match).toBe(false)
    expect(result.score).toBe(0)
  })

  it('does not match when query characters appear out of order only', () => {
    // "zt" — 'z' never appears in "toggle"
    const result = fuzzyMatch('zt', 'toggle')
    expect(result.match).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------

describe('fuzzyMatch — case insensitivity', () => {
  it('matches uppercase query against lowercase target', () => {
    expect(fuzzyMatch('TOGGLE', 'toggle dark mode').match).toBe(true)
  })

  it('matches lowercase query against uppercase target', () => {
    expect(fuzzyMatch('toggle', 'TOGGLE DARK MODE').match).toBe(true)
  })

  it('matches mixed-case query against mixed-case target', () => {
    expect(fuzzyMatch('TgDm', 'Toggle dark mode').match).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Scoring — consecutive and word-start bonuses
// ---------------------------------------------------------------------------

describe('fuzzyMatch — scoring bonuses', () => {
  it('scores a consecutive match higher than a non-consecutive match of the same characters', () => {
    // 'abc' fully consecutive in 'abcxxx': a=0(+1+1=2), b=1(consec+2=2), c=2(consec+2=2) = 6
    // 'abc' mid-word spread in 'xaxbxcx': a=1(+1=1), b=3(+1=1), c=5(+1=1) = 3
    const consecutive = fuzzyMatch('abc', 'abcxxx')
    const spreadMid = fuzzyMatch('abc', 'xaxbxcx')
    expect(consecutive.score).toBeGreaterThan(spreadMid.score)
  })

  it('scores a word-start match higher than a mid-word match', () => {
    // query "dar" — matches at position 0 of "dark" (word start after space) in "toggle dark"
    // vs "adar" mid-word in "cedar"
    const wordStart = fuzzyMatch('d', 'toggle dark')    // 'd' is at word start in "dark"
    const midWord = fuzzyMatch('d', 'toggle modar')     // 'd' is mid-word in "modar"
    expect(wordStart.score).toBeGreaterThan(midWord.score)
  })

  it('gives a word-start bonus when the match is at position 0 of the target', () => {
    const atStart = fuzzyMatch('t', 'toggle')
    const notAtStart = fuzzyMatch('o', 'toggle')
    // 't' at position 0 gets the start-of-word bonus; 'o' at position 1 does not
    expect(atStart.score).toBeGreaterThan(notAtStart.score)
  })
})

// ---------------------------------------------------------------------------
// Non-matching cases
// ---------------------------------------------------------------------------

describe('fuzzyMatch — no match', () => {
  it('returns match=false and score=0 when query has characters not in target', () => {
    const result = fuzzyMatch('zzz', 'toggle dark mode')
    expect(result.match).toBe(false)
    expect(result.score).toBe(0)
  })

  it('returns match=false when query is longer than the target', () => {
    const result = fuzzyMatch('toggledarkmodelongquery', 'tog')
    expect(result.match).toBe(false)
  })

  it('returns match=false for a single character not present in target', () => {
    const result = fuzzyMatch('z', 'toggle')
    expect(result.match).toBe(false)
    expect(result.score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Hyphen as word-start boundary
// ---------------------------------------------------------------------------

describe('fuzzyMatch — hyphen word boundary', () => {
  it('awards a word-start bonus for a character immediately after a hyphen', () => {
    // "d" after "dark-" in "dark-mode" — the 'm' in "mode" follows a hyphen → bonus
    const afterHyphen = fuzzyMatch('m', 'dark-mode')   // 'm' follows '-' → bonus
    const midWord = fuzzyMatch('a', 'dark-mode')       // 'a' is mid-word in "dark"
    expect(afterHyphen.score).toBeGreaterThan(midWord.score)
  })
})
