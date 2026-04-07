import { describe, it, expect } from 'vitest'
import {
  computeConservativeCompileEstimate,
  COMPILE_OVERHEAD_TOKENS,
  CONSERVATIVE_ESTIMATE_MULTIPLIER,
} from './compile-estimate'

/**
 * Tests for the pure conservative-estimate helper used by the Compile
 * Document button's context-window warning. The formula is:
 *
 *   ceil(threadTokens × CONSERVATIVE_ESTIMATE_MULTIPLIER) + COMPILE_OVERHEAD_TOKENS + focusTokens
 *
 * The whole point is to lean HIGH so users don't see "safe" numbers
 * that then fail the actual API call.
 *
 * Tests verify the lean-high invariant abstractly (against the exported
 * constants) so changes to the multiplier or overhead don't require
 * updating arithmetic expectations everywhere — only the handful of
 * "documented intent" tests that pin specific numbers to specific
 * user-facing scenarios.
 */

function expected(threadTokens: number, focusTokens: number): number {
  return Math.ceil(threadTokens * CONSERVATIVE_ESTIMATE_MULTIPLIER)
    + COMPILE_OVERHEAD_TOKENS
    + focusTokens
}

describe('computeConservativeCompileEstimate', () => {
  describe('base behavior', () => {
    it('returns just the overhead when thread and focus are both zero', () => {
      expect(computeConservativeCompileEstimate(0, 0)).toBe(COMPILE_OVERHEAD_TOKENS)
    })

    it('applies the multiplier to the thread count', () => {
      expect(computeConservativeCompileEstimate(1000, 0)).toBe(expected(1000, 0))
    })

    it('adds focus tokens without applying the multiplier to them', () => {
      const withoutFocus = computeConservativeCompileEstimate(1000, 0)
      const withFocus = computeConservativeCompileEstimate(1000, 200)
      expect(withFocus - withoutFocus).toBe(200)
    })

    it('rounds the multiplied thread count up (never down)', () => {
      // 1001 × multiplier may produce a fractional value — must be ceiled
      const estimate = computeConservativeCompileEstimate(1001, 0)
      expect(estimate).toBe(expected(1001, 0))
      expect(Number.isInteger(estimate)).toBe(true)
    })
  })

  describe('the LEAN HIGH invariant — always overestimates', () => {
    it('returns a value greater than the raw thread count for any non-zero input', () => {
      for (const thread of [1, 100, 1_000, 10_000, 100_000]) {
        const estimate = computeConservativeCompileEstimate(thread, 0)
        expect(estimate).toBeGreaterThan(thread)
      }
    })

    it('is at least MULTIPLIER times higher than the raw thread count (ignoring overhead)', () => {
      for (const thread of [100, 1_000, 10_000, 100_000]) {
        const estimate = computeConservativeCompileEstimate(thread, 0)
        // Subtract the fixed overhead to isolate the thread contribution
        const inflatedThread = estimate - COMPILE_OVERHEAD_TOKENS
        expect(inflatedThread).toBeGreaterThanOrEqual(thread * CONSERVATIVE_ESTIMATE_MULTIPLIER)
      }
    })

    it('adds overhead on top of the multiplied thread (not instead of)', () => {
      const thread = 1000
      const estimate = computeConservativeCompileEstimate(thread, 0)
      const multiplierAlone = Math.ceil(thread * CONSERVATIVE_ESTIMATE_MULTIPLIER)
      expect(estimate).toBe(multiplierAlone + COMPILE_OVERHEAD_TOKENS)
      expect(estimate).toBeGreaterThan(multiplierAlone)
      expect(estimate).toBeGreaterThan(COMPILE_OVERHEAD_TOKENS)
    })

    it('covers code-heavy content (~3 chars/token, ~1.33x true count)', () => {
      // If the base estimator under-counts by 33% (code ≈ 3 chars/token,
      // estimator assumes 4), the conservative multiplier must be
      // >= 1.33 to avoid false safes. We use 1.5 for comfortable margin.
      expect(CONSERVATIVE_ESTIMATE_MULTIPLIER).toBeGreaterThanOrEqual(1.33)
    })
  })

  describe('regression: the "false safe" cases that motivated the fix', () => {
    it('a 5500-token chat against an 8k model is correctly flagged as exceeded', () => {
      // BEFORE the conservative estimate: 5500 / 8000 = 68% → muted
      // AFTER (1.5x): ceil(5500 × 1.5) + 300 = 8250 + 300 = 8550 > 8000 → EXCEEDS
      // This is the exact case where the user would have clicked "safe"
      // and the API call would have failed on a code-heavy chat.
      const estimate = computeConservativeCompileEstimate(5500, 0)
      expect(estimate).toBeGreaterThan(8000)
    })

    it('an 80k-token chat against a 128k model is flagged above 90% (not 63%)', () => {
      // BEFORE: 80000 / 128000 = 63% → completely muted, user has no idea they're near the limit
      // AFTER (1.5x): ceil(80000 × 1.5) + 300 = 120300 / 128000 ≈ 94% → yellow warning
      const estimate = computeConservativeCompileEstimate(80_000, 0)
      const percent = (estimate / 128_000) * 100
      expect(percent).toBeGreaterThan(90)
      expect(percent).toBeLessThan(100)
    })

    it('a 90k-token chat against a 128k model is flagged as exceeded', () => {
      // AFTER (1.5x): ceil(90000 × 1.5) + 300 = 135300 > 128000 → red exceeds
      // BEFORE: 90000 / 128000 = 70% → muted, looked completely safe
      const estimate = computeConservativeCompileEstimate(90_000, 0)
      expect(estimate).toBeGreaterThan(128_000)
    })
  })

  describe('focus prompt contribution', () => {
    it('a long focus prompt pushes the estimate higher', () => {
      const withoutFocus = computeConservativeCompileEstimate(1000, 0)
      const withFocus = computeConservativeCompileEstimate(1000, 500)
      expect(withFocus).toBe(withoutFocus + 500)
    })

    it('focus tokens are added as-is (no multiplier, no additional overhead)', () => {
      const estimate = computeConservativeCompileEstimate(0, 1000)
      expect(estimate).toBe(COMPILE_OVERHEAD_TOKENS + 1000)
    })
  })

  describe('edge cases', () => {
    it('handles very large thread counts without overflow', () => {
      const huge = 10_000_000
      const estimate = computeConservativeCompileEstimate(huge, 0)
      expect(estimate).toBe(expected(huge, 0))
      expect(Number.isFinite(estimate)).toBe(true)
      expect(Number.isInteger(estimate)).toBe(true)
    })

    it('returns an integer (useful for UI rendering)', () => {
      // Use a value that produces a fraction under the multiplier
      const estimate = computeConservativeCompileEstimate(333, 0)
      expect(Number.isInteger(estimate)).toBe(true)
      expect(estimate).toBe(expected(333, 0))
    })

    it('is deterministic — same inputs produce same output', () => {
      const a = computeConservativeCompileEstimate(5000, 100)
      const b = computeConservativeCompileEstimate(5000, 100)
      expect(a).toBe(b)
    })
  })

  describe('documented constants', () => {
    it('COMPILE_OVERHEAD_TOKENS is a positive integer', () => {
      expect(Number.isInteger(COMPILE_OVERHEAD_TOKENS)).toBe(true)
      expect(COMPILE_OVERHEAD_TOKENS).toBeGreaterThan(0)
    })

    it('CONSERVATIVE_ESTIMATE_MULTIPLIER is > 1 (must actually inflate)', () => {
      expect(CONSERVATIVE_ESTIMATE_MULTIPLIER).toBeGreaterThan(1)
    })

    it('CONSERVATIVE_ESTIMATE_MULTIPLIER is at least 1.33 to cover code', () => {
      // The base char-estimator assumes ~4 chars/token (English prose).
      // Code is typically ~3 chars/token, a 33% under-count. The multiplier
      // must cover this floor to fulfill its "lean high" contract.
      expect(CONSERVATIVE_ESTIMATE_MULTIPLIER).toBeGreaterThanOrEqual(1.33)
    })
  })
})
