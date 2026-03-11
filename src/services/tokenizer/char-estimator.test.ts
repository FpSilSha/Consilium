import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  estimateCost,
  estimateCallCost,
} from './char-estimator'

describe('estimateTokens', () => {
  describe('boundary values', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0)
    })

    it('returns 1 for a single character', () => {
      expect(estimateTokens('a')).toBe(1)
    })

    it('returns 1 for exactly 4 characters', () => {
      expect(estimateTokens('abcd')).toBe(1)
    })

    it('returns 2 for 5 characters (ceil applied)', () => {
      expect(estimateTokens('abcde')).toBe(2)
    })

    it('returns 2 for exactly 8 characters', () => {
      expect(estimateTokens('abcdefgh')).toBe(2)
    })

    it('returns 3 for 9 characters (ceil applied)', () => {
      expect(estimateTokens('abcdefghi')).toBe(3)
    })
  })

  describe('unicode and special characters', () => {
    it('counts emoji by char length (emoji is 2 code units)', () => {
      // '😀' has .length === 2 in JS, so Math.ceil(2/4) === 1
      expect(estimateTokens('😀')).toBe(1)
    })

    it('counts multi-emoji string by total char length', () => {
      // 4 emojis = 8 code units → Math.ceil(8/4) === 2
      const fourEmojis = '😀😀😀😀'
      expect(estimateTokens(fourEmojis)).toBe(fourEmojis.length / 4)
    })

    it('counts unicode letters using .length property', () => {
      // 'café' = 4 chars → 1 token
      expect(estimateTokens('café')).toBe(1)
    })

    it('counts a 100-character string as 25 tokens', () => {
      const text = 'a'.repeat(100)
      expect(estimateTokens(text)).toBe(25)
    })
  })
})

describe('estimateCost', () => {
  it('multiplies token estimate by price per token', () => {
    // 'abcd' → 1 token, at $0.01 → $0.01
    expect(estimateCost('abcd', 0.01)).toBe(0.01)
  })

  it('applies ceil before multiplying (5 chars → 2 tokens)', () => {
    // 'abcde' → 2 tokens, at $0.005 → $0.01
    expect(estimateCost('abcde', 0.005)).toBe(0.01)
  })

  it('returns 0 when price is zero', () => {
    expect(estimateCost('any text here', 0)).toBe(0)
  })

  it('returns 0 for empty string regardless of price', () => {
    expect(estimateCost('', 99)).toBe(0)
  })

  it('scales correctly with large text', () => {
    const text = 'a'.repeat(1000) // 250 tokens
    expect(estimateCost(text, 0.002)).toBeCloseTo(0.5)
  })

  it('handles fractional prices correctly', () => {
    // 8 chars → 2 tokens, at $0.003 → $0.006
    expect(estimateCost('12345678', 0.003)).toBeCloseTo(0.006)
  })
})

describe('estimateCallCost', () => {
  it('returns 0 when both texts are empty', () => {
    expect(estimateCallCost('', '', 0.01, 0.02)).toBe(0)
  })

  it('sums input and output costs with symmetric pricing', () => {
    // 'abcd' → 1 token input, 'efgh' → 1 token output, both at $0.01 → $0.02
    expect(estimateCallCost('abcd', 'efgh', 0.01, 0.01)).toBeCloseTo(0.02)
  })

  it('sums input and output costs with asymmetric pricing', () => {
    // 'aaaa' → 1 token at $0.01, 'bbbbbbbb' → 2 tokens at $0.03 → $0.07
    expect(estimateCallCost('aaaa', 'bbbbbbbb', 0.01, 0.03)).toBeCloseTo(0.07)
  })

  it('returns only input cost when output is empty', () => {
    // 'abcd' → 1 token at $0.005 → $0.005
    expect(estimateCallCost('abcd', '', 0.005, 0.01)).toBeCloseTo(0.005)
  })

  it('returns only output cost when input is empty', () => {
    // '' → 0 tokens, 'abcdefgh' → 2 tokens at $0.004 → $0.008
    expect(estimateCallCost('', 'abcdefgh', 0.01, 0.004)).toBeCloseTo(0.008)
  })

  it('uses output price only for output tokens, not input price', () => {
    // input 'abcd' → 1 token at $100 → $100
    // output 'abcd' → 1 token at $1   → $1
    // total → $101
    expect(estimateCallCost('abcd', 'abcd', 100, 1)).toBeCloseTo(101)
  })

  it('applies ceil independently to input and output', () => {
    // 'abcde' → ceil(5/4)=2 tokens at $0.01 → $0.02
    // 'xyz12' → ceil(5/4)=2 tokens at $0.02 → $0.04
    // total → $0.06
    expect(estimateCallCost('abcde', 'xyz12', 0.01, 0.02)).toBeCloseTo(0.06)
  })
})
