import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/context-bus/identity-headers', () => ({
  extractMentions: vi.fn(),
  stripMentions: vi.fn(),
}))

import { extractMentions, stripMentions } from '@/services/context-bus/identity-headers'
import {
  resolveMentionTargets,
  cleanMentions,
  hasMentions,
} from '@/features/agentInteraction/mention-router'
import type { AdvisorWindow } from '@/types'

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeWindow(id: string, personaLabel: string): AdvisorWindow {
  return {
    id,
    personaLabel,
    provider: 'anthropic',
    keyId: 'key1',
    model: 'claude-opus-4-6',
    personaId: 'p1',
    accentColor: '#fff',
    runningCost: 0,
    isStreaming: false,
    streamContent: '',
    error: null,
    isCompacted: false,
    compactedSummary: null,
    bufferSize: 10,
  }
}

// ---------------------------------------------------------------------------
// Helpers to set up mocked return values
// ---------------------------------------------------------------------------

function mockExtract(mentions: string[]) {
  vi.mocked(extractMentions).mockReturnValue(mentions)
}

function mockStrip(result: string) {
  vi.mocked(stripMentions).mockReturnValue(result)
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// resolveMentionTargets
// ---------------------------------------------------------------------------

describe('resolveMentionTargets', () => {
  describe('when there are no mentions', () => {
    it('returns empty array when extractMentions yields nothing', () => {
      mockExtract([])
      const windows = { w1: makeWindow('w1', 'Security Engineer') }

      const result = resolveMentionTargets('hello there', windows)

      expect(result).toEqual([])
    })

    it('returns empty array when windows record is empty even with mentions', () => {
      mockExtract(['security'])

      const result = resolveMentionTargets('@security', {})

      expect(result).toEqual([])
    })
  })

  describe('exact label match', () => {
    it('returns window id when mention matches personaLabel exactly (lowercased)', () => {
      mockExtract(['finance'])
      const windows = { w1: makeWindow('w1', 'Finance') }

      const result = resolveMentionTargets('@Finance', windows)

      expect(result).toEqual(['w1'])
    })
  })

  describe('partial label match', () => {
    it('matches when mention is a substring of personaLabel', () => {
      mockExtract(['security'])
      const windows = { w1: makeWindow('w1', 'Security Engineer') }

      const result = resolveMentionTargets('@security something', windows)

      expect(result).toEqual(['w1'])
    })

    it('matches when mention is a substring of the middle of a label', () => {
      mockExtract(['engineer'])
      const windows = { w1: makeWindow('w1', 'Security Engineer') }

      const result = resolveMentionTargets('@engineer', windows)

      expect(result).toEqual(['w1'])
    })
  })

  describe('case-insensitive matching', () => {
    it('matches uppercase mention against mixed-case personaLabel', () => {
      mockExtract(['SECURITY'])
      const windows = { w1: makeWindow('w1', 'Security Engineer') }

      const result = resolveMentionTargets('@SECURITY', windows)

      expect(result).toEqual(['w1'])
    })

    it('matches lowercase mention against uppercase personaLabel', () => {
      mockExtract(['cto'])
      const windows = { w1: makeWindow('w1', 'CTO') }

      const result = resolveMentionTargets('@cto', windows)

      expect(result).toEqual(['w1'])
    })
  })

  describe('space-stripped matching', () => {
    it('matches mention without spaces against personaLabel that has spaces', () => {
      mockExtract(['SecurityEngineer'])
      const windows = { w1: makeWindow('w1', 'Security Engineer') }

      const result = resolveMentionTargets('@SecurityEngineer', windows)

      expect(result).toEqual(['w1'])
    })

    it('matches compound mention against multi-word label', () => {
      mockExtract(['legaladvisor'])
      const windows = { w1: makeWindow('w1', 'Legal Advisor') }

      const result = resolveMentionTargets('@legaladvisor', windows)

      expect(result).toEqual(['w1'])
    })
  })

  describe('no matching window', () => {
    it('returns empty array when no window label contains the mention', () => {
      mockExtract(['marketing'])
      const windows = {
        w1: makeWindow('w1', 'Security Engineer'),
        w2: makeWindow('w2', 'Legal Advisor'),
      }

      const result = resolveMentionTargets('@marketing', windows)

      expect(result).toEqual([])
    })
  })

  describe('multiple mentions', () => {
    it('returns multiple window IDs preserving order of mentions', () => {
      mockExtract(['legal', 'security'])
      const windows = {
        w1: makeWindow('w1', 'Security Engineer'),
        w2: makeWindow('w2', 'Legal Advisor'),
      }

      const result = resolveMentionTargets('@legal @security', windows)

      expect(result).toEqual(['w2', 'w1'])
    })

    it('omits unresolved mentions and includes resolved ones', () => {
      mockExtract(['security', 'unknown'])
      const windows = { w1: makeWindow('w1', 'Security Engineer') }

      const result = resolveMentionTargets('@security @unknown', windows)

      expect(result).toEqual(['w1'])
    })
  })

  describe('mention matching multiple windows', () => {
    it('returns only the first matching window id when multiple windows match', () => {
      mockExtract(['advisor'])
      // Object.values order follows insertion order in V8
      const windows: Record<string, AdvisorWindow> = {
        w1: makeWindow('w1', 'Legal Advisor'),
        w2: makeWindow('w2', 'Financial Advisor'),
      }

      const result = resolveMentionTargets('@advisor', windows)

      // Only the first match (w1) should be returned
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('w1')
    })
  })
})

// ---------------------------------------------------------------------------
// cleanMentions
// ---------------------------------------------------------------------------

describe('cleanMentions', () => {
  it('delegates to stripMentions and returns its result', () => {
    mockStrip('what do you think?')

    const result = cleanMentions('@SecurityAdvisor what do you think?')

    expect(stripMentions).toHaveBeenCalledWith('@SecurityAdvisor what do you think?')
    expect(result).toBe('what do you think?')
  })

  it('passes the exact input string through to stripMentions', () => {
    const input = '@Alice @Bob please review this'
    mockStrip('please review this')

    cleanMentions(input)

    expect(stripMentions).toHaveBeenCalledOnce()
    expect(stripMentions).toHaveBeenCalledWith(input)
  })

  it('returns an empty string when stripMentions returns empty string', () => {
    mockStrip('')

    const result = cleanMentions('@only-a-mention')

    expect(result).toBe('')
  })

  it('preserves surrounding text returned by stripMentions', () => {
    mockStrip('hello world')

    const result = cleanMentions('@bot hello world')

    expect(result).toBe('hello world')
  })
})

// ---------------------------------------------------------------------------
// hasMentions
// ---------------------------------------------------------------------------

describe('hasMentions', () => {
  it('returns true when extractMentions yields at least one mention', () => {
    mockExtract(['security'])

    expect(hasMentions('@security check this')).toBe(true)
  })

  it('returns false when extractMentions yields an empty array', () => {
    mockExtract([])

    expect(hasMentions('no mention here')).toBe(false)
  })

  it('returns false for an empty string', () => {
    mockExtract([])

    expect(hasMentions('')).toBe(false)
  })

  it('returns true for multiple mentions', () => {
    mockExtract(['alice', 'bob'])

    expect(hasMentions('@alice and @bob')).toBe(true)
  })

  it('calls extractMentions with the exact content string', () => {
    const content = '@reviewer please look at this'
    mockExtract(['reviewer'])

    hasMentions(content)

    expect(extractMentions).toHaveBeenCalledWith(content)
  })
})
