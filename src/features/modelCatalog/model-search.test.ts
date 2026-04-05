import { describe, it, expect } from 'vitest'
import { searchModels } from './model-search'
import type { ModelInfo } from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeModel(id: string, name: string): ModelInfo {
  return {
    id,
    name,
    provider: 'openai',
    contextWindow: 128_000,
    inputPricePerToken: 0,
    outputPricePerToken: 0,
  }
}

const MODELS: readonly ModelInfo[] = [
  makeModel('gpt-4o', 'GPT-4o'),
  makeModel('gpt-4o-mini', 'GPT-4o Mini'),
  makeModel('claude-opus-4-6', 'Claude Opus 4.6'),
  makeModel('claude-sonnet-4-6', 'Claude Sonnet 4.6'),
  makeModel('claude-haiku-4-5', 'Claude Haiku 4.5'),
  makeModel('gemini-2.0-flash', 'Gemini 2.0 Flash'),
]

// ---------------------------------------------------------------------------
// Empty query
// ---------------------------------------------------------------------------

describe('searchModels — empty query', () => {
  it('returns all models unchanged when query is an empty string', () => {
    const result = searchModels(MODELS, '')
    expect(result).toHaveLength(MODELS.length)
    expect(result).toEqual(MODELS)
  })

  it('returns all models when query is only whitespace', () => {
    const result = searchModels(MODELS, '   ')
    expect(result).toHaveLength(MODELS.length)
  })
})

// ---------------------------------------------------------------------------
// All-tokens-must-match (AND logic)
// ---------------------------------------------------------------------------

describe('searchModels — AND matching (all tokens must appear)', () => {
  it('matches a model only when BOTH tokens appear', () => {
    // "gpt mini" — both "gpt" and "mini" must be present
    const result = searchModels(MODELS, 'gpt mini')
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('gpt-4o-mini')
  })

  it('excludes a model if even one token is missing', () => {
    // "claude flash" — no claude model has "flash" in name or id
    const result = searchModels(MODELS, 'claude flash')
    expect(result).toHaveLength(0)
  })

  it('matches across both name and id fields when tokens are split between them', () => {
    // "4o mini" — "4o" is in both name/id, "mini" is in name/id of gpt-4o-mini
    const result = searchModels(MODELS, '4o mini')
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('gpt-4o-mini')
  })
})

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------

describe('searchModels — case insensitivity', () => {
  it('matches uppercase query against lowercase model name', () => {
    const result = searchModels(MODELS, 'CLAUDE')
    const ids = result.map((m) => m.id)
    expect(ids).toContain('claude-opus-4-6')
    expect(ids).toContain('claude-sonnet-4-6')
    expect(ids).toContain('claude-haiku-4-5')
  })

  it('matches mixed-case query', () => {
    const result = searchModels(MODELS, 'Gemini')
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('gemini-2.0-flash')
  })
})

// ---------------------------------------------------------------------------
// Scoring — prefix match wins
// ---------------------------------------------------------------------------

describe('searchModels — scoring order', () => {
  it('ranks a prefix-match model before a mid-string-match model', () => {
    // "claude" prefix-matches all claude models: first token at position 0 in name
    // "gemini" also starts with "gemini" but not relevant here.
    // Use a query where one model is a name-prefix match and another is only an id match.
    const models: readonly ModelInfo[] = [
      makeModel('provider-gpt4', 'Some GPT4 Model'),   // "gpt4" appears mid-name
      makeModel('gpt4-turbo', 'GPT4 Turbo'),            // "gpt4" is name prefix
    ]
    const result = searchModels(models, 'gpt4')
    // gpt4-turbo has name starting with "gpt4" → gets prefix bonus → should rank first
    expect(result[0]!.id).toBe('gpt4-turbo')
  })

  it('ranks name-only match above id-only match for same query', () => {
    // "opus" appears in name "Claude Opus 4.6" but not the id prefix
    // Create a model whose id starts with "opus" but name does not contain it
    const models: readonly ModelInfo[] = [
      makeModel('opus-experimental', 'Experimental Model X'),  // id has "opus", name does not
      makeModel('claude-opus-4-6', 'Claude Opus 4.6'),         // both have "opus"
    ]
    const result = searchModels(models, 'opus')
    // claude-opus-4-6 matches in name → score 100+ ; opus-experimental matches only in id → score 50+
    expect(result[0]!.id).toBe('claude-opus-4-6')
  })

  it('assigns a lower score to a mixed-field match than a pure-name match', () => {
    // "claude flash": "claude" in name, "flash" only in id (gemini-2.0-flash id doesn't have claude)
    // Instead build controlled fixtures:
    const models: readonly ModelInfo[] = [
      makeModel('claude-flash-exp', 'Claude Flash Experimental'),  // both tokens in name
      makeModel('flashclaude-v1', 'Model V1 with flash'),          // "claude" in id only, "flash" in name
    ]
    // query "claude flash"
    const result = searchModels(models, 'claude flash')
    // claude-flash-exp: allMatchName=true → score ≥ 100
    // flashclaude-v1: "claude" in id, "flash" in name → mixed → score 25
    expect(result[0]!.id).toBe('claude-flash-exp')
  })
})

// ---------------------------------------------------------------------------
// Token order independence
// ---------------------------------------------------------------------------

describe('searchModels — token order independence', () => {
  it('returns same models regardless of token order in query', () => {
    const result1 = searchModels(MODELS, 'claude sonnet')
    const result2 = searchModels(MODELS, 'sonnet claude')
    const ids1 = result1.map((m) => m.id).sort()
    const ids2 = result2.map((m) => m.id).sort()
    expect(ids1).toEqual(ids2)
  })

  it('returns same models for "mini gpt" as for "gpt mini"', () => {
    const r1 = searchModels(MODELS, 'gpt mini')
    const r2 = searchModels(MODELS, 'mini gpt')
    expect(r1.map((m) => m.id).sort()).toEqual(r2.map((m) => m.id).sort())
  })
})

// ---------------------------------------------------------------------------
// Single-token searches
// ---------------------------------------------------------------------------

describe('searchModels — single token', () => {
  it('returns all models whose name or id contains the token', () => {
    const result = searchModels(MODELS, 'claude')
    const ids = result.map((m) => m.id)
    expect(ids).toContain('claude-opus-4-6')
    expect(ids).toContain('claude-sonnet-4-6')
    expect(ids).toContain('claude-haiku-4-5')
    expect(ids).not.toContain('gpt-4o')
    expect(ids).not.toContain('gemini-2.0-flash')
  })

  it('returns empty array when token matches nothing', () => {
    const result = searchModels(MODELS, 'llama')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Empty model list
// ---------------------------------------------------------------------------

describe('searchModels — empty model list', () => {
  it('returns empty array when no models are provided', () => {
    expect(searchModels([], 'gpt')).toHaveLength(0)
    expect(searchModels([], '')).toHaveLength(0)
  })
})
