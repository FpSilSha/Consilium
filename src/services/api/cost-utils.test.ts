import { describe, it, expect } from 'vitest'
import { buildCostMetadata } from './cost-utils'
import type { TokenUsage } from './types'

// Actual pricing from model-registry.ts (used to verify math without re-importing internals)
const CLAUDE_OPUS_INPUT_PRICE = 0.000015
const CLAUDE_OPUS_OUTPUT_PRICE = 0.000075
const CLAUDE_SONNET_INPUT_PRICE = 0.000003
const CLAUDE_SONNET_OUTPUT_PRICE = 0.000015
const CLAUDE_HAIKU_INPUT_PRICE = 0.0000008
const CLAUDE_HAIKU_OUTPUT_PRICE = 0.000004

describe('buildCostMetadata', () => {
  describe('when tokenUsage is undefined', () => {
    it('returns undefined regardless of modelId', () => {
      expect(buildCostMetadata(undefined, 'claude-opus-4-6')).toBeUndefined()
    })
  })

  describe('with a known model (claude-opus-4-6)', () => {
    const usage: TokenUsage = { inputTokens: 1000, outputTokens: 500 }

    it('returns correct token counts, cost, and isEstimate=false', () => {
      const expected = 1000 * CLAUDE_OPUS_INPUT_PRICE + 500 * CLAUDE_OPUS_OUTPUT_PRICE
      const result = buildCostMetadata(usage, 'claude-opus-4-6')
      expect(result?.inputTokens).toBe(1000)
      expect(result?.outputTokens).toBe(500)
      expect(result?.estimatedCost).toBeCloseTo(expected, 10)
      expect(result?.isEstimate).toBe(false)
    })
  })

  describe('with a known model (claude-sonnet-4-6) — verifies different pricing', () => {
    it('uses the sonnet price rates not opus rates', () => {
      const usage: TokenUsage = { inputTokens: 2000, outputTokens: 800 }
      const expected = 2000 * CLAUDE_SONNET_INPUT_PRICE + 800 * CLAUDE_SONNET_OUTPUT_PRICE
      const result = buildCostMetadata(usage, 'claude-sonnet-4-6')
      expect(result?.estimatedCost).toBeCloseTo(expected, 10)
      expect(result?.isEstimate).toBe(false)
    })
  })

  describe('with a known model (claude-haiku-4-5-20251001)', () => {
    it('correctly computes cost using haiku pricing', () => {
      const usage: TokenUsage = { inputTokens: 5000, outputTokens: 1200 }
      const expected = 5000 * CLAUDE_HAIKU_INPUT_PRICE + 1200 * CLAUDE_HAIKU_OUTPUT_PRICE
      const result = buildCostMetadata(usage, 'claude-haiku-4-5-20251001')
      expect(result?.estimatedCost).toBeCloseTo(expected, 10)
      expect(result?.isEstimate).toBe(false)
    })
  })

  describe('with zero token counts', () => {
    it('returns 0 estimated cost when both token counts are 0', () => {
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      const result = buildCostMetadata(usage, 'claude-opus-4-6')
      expect(result).not.toBeUndefined()
      expect(result?.estimatedCost).toBe(0)
      expect(result?.inputTokens).toBe(0)
      expect(result?.outputTokens).toBe(0)
      expect(result?.isEstimate).toBe(false)
    })

    it('returns 0 estimated cost for zero tokens with unknown model', () => {
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      const result = buildCostMetadata(usage, 'unknown-model')
      expect(result).not.toBeUndefined()
      expect(result?.estimatedCost).toBe(0)
      expect(result?.isEstimate).toBe(true)
    })
  })

  describe('with an unknown model', () => {
    const usage: TokenUsage = { inputTokens: 1000, outputTokens: 500 }

    it('returns isEstimate=true with 0 cost but preserves token counts', () => {
      const result = buildCostMetadata(usage, 'totally-unknown-model')
      expect(result?.isEstimate).toBe(true)
      expect(result?.estimatedCost).toBe(0)
      expect(result?.inputTokens).toBe(1000)
      expect(result?.outputTokens).toBe(500)
    })

    it('returns isEstimate=true for empty-string model ID', () => {
      const result = buildCostMetadata(usage, '')
      expect(result?.isEstimate).toBe(true)
    })
  })

  describe('large token counts (floating-point precision)', () => {
    it('handles 100k input and 50k output tokens with claude-opus-4-6', () => {
      const usage: TokenUsage = { inputTokens: 100_000, outputTokens: 50_000 }
      const expected = 100_000 * CLAUDE_OPUS_INPUT_PRICE + 50_000 * CLAUDE_OPUS_OUTPUT_PRICE
      const result = buildCostMetadata(usage, 'claude-opus-4-6')
      // $1.50 input + $3.75 output = $5.25
      expect(result?.estimatedCost).toBeCloseTo(expected, 6)
      expect(result?.estimatedCost).toBeCloseTo(5.25, 6)
    })

    it('handles 1M tokens with gemini-2.0-flash (very small per-token price)', () => {
      const usage: TokenUsage = { inputTokens: 1_000_000, outputTokens: 1_000_000 }
      const result = buildCostMetadata(usage, 'gemini-2.0-flash')
      // inputPrice=0.00000010, outputPrice=0.00000040
      const expected = 1_000_000 * 0.00000010 + 1_000_000 * 0.00000040
      expect(result?.estimatedCost).toBeCloseTo(expected, 6)
      expect(result?.isEstimate).toBe(false)
    })
  })
})
