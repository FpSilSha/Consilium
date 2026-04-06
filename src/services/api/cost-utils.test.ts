import { describe, it, expect, afterEach } from 'vitest'
import { buildCostMetadata } from './cost-utils'
import type { TokenUsage } from './types'
import { useStore } from '@/store'

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

  // ─────────────────────────────────────────────────────────────────────
  // Free models — must be distinguishable from "unknown" models
  // ─────────────────────────────────────────────────────────────────────

  describe('with a free model in the OpenRouter catalog', () => {
    const FREE_MODEL_ID = 'arcee-ai/trinity-large-preview:free'

    afterEach(() => {
      // Reset catalog so other tests aren't affected
      useStore.getState().setCatalogModels('openrouter', [])
    })

    function seedFreeModel(): void {
      useStore.getState().setCatalogModels('openrouter', [
        {
          id: FREE_MODEL_ID,
          name: 'Arcee AI: Trinity Large Preview (free)',
          provider: 'openrouter',
          contextWindow: 131072,
          inputPricePerToken: 0,
          outputPricePerToken: 0,
        },
      ])
    }

    it('reports cost as $0 with isEstimate=false (we KNOW it is free)', () => {
      seedFreeModel()
      const usage: TokenUsage = { inputTokens: 1500, outputTokens: 800 }
      const result = buildCostMetadata(usage, FREE_MODEL_ID)

      expect(result).not.toBeUndefined()
      expect(result?.estimatedCost).toBe(0)
      expect(result?.isEstimate).toBe(false) // ← key assertion: NOT an estimate
      expect(result?.inputTokens).toBe(1500)
      expect(result?.outputTokens).toBe(800)
    })

    it('regression: free model with zero token usage still returns confirmed metadata', () => {
      // This is the original bug — Arcee Trinity reported {0, 0} usage, the
      // orchestrator dropped it as "no usage", and the message ended up with
      // costMetadata: undefined → "unable to track cost" in the UI.
      // Even with zero tokens, the metadata should be a known $0, not undefined.
      seedFreeModel()
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      const result = buildCostMetadata(usage, FREE_MODEL_ID)

      expect(result).not.toBeUndefined()
      expect(result?.estimatedCost).toBe(0)
      expect(result?.isEstimate).toBe(false)
    })

    it('distinguishes free-with-catalog-hit from unknown-no-hit', () => {
      seedFreeModel()
      const usage: TokenUsage = { inputTokens: 100, outputTokens: 50 }

      const free = buildCostMetadata(usage, FREE_MODEL_ID)
      const unknown = buildCostMetadata(usage, 'completely-made-up-model-id')

      // Both have estimatedCost === 0, but the free one is confirmed
      expect(free?.estimatedCost).toBe(0)
      expect(unknown?.estimatedCost).toBe(0)
      expect(free?.isEstimate).toBe(false)
      expect(unknown?.isEstimate).toBe(true)
    })
  })

  describe('OpenRouter catalog match by suffix (provider/model format)', () => {
    afterEach(() => {
      useStore.getState().setCatalogModels('openrouter', [])
    })

    it('finds a free model by suffix when looked up by short id', () => {
      // Stored as full prefix in OpenRouter catalog
      useStore.getState().setCatalogModels('openrouter', [
        {
          id: 'meta-llama/llama-3.1-8b-instruct:free',
          name: 'Llama 3.1 8B (free)',
          provider: 'openrouter',
          contextWindow: 131072,
          inputPricePerToken: 0,
          outputPricePerToken: 0,
        },
      ])

      // Caller passes the suffix only
      const usage: TokenUsage = { inputTokens: 500, outputTokens: 200 }
      const result = buildCostMetadata(usage, 'llama-3.1-8b-instruct:free')

      expect(result).not.toBeUndefined()
      expect(result?.isEstimate).toBe(false)
      expect(result?.estimatedCost).toBe(0)
    })
  })
})
