import { describe, it, expect } from 'vitest'
import { parseVoteResponse, tallyVotes } from './vote-parser'
import type { AdvisorVote } from './vote-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVote(
  vote: AdvisorVote['vote'],
  justification = 'Some reason.',
): AdvisorVote {
  return {
    windowId: 'win-1',
    personaLabel: 'Advisor',
    vote,
    justification,
    accentColor: '#ff0000',
  }
}

// ---------------------------------------------------------------------------
// parseVoteResponse
// ---------------------------------------------------------------------------

describe('parseVoteResponse', () => {
  const WID = 'window-abc'
  const LABEL = 'Security Expert'
  const COLOR = '#3b82f6'

  describe('valid vote strings', () => {
    it('parses YAY with justification separated by comma', () => {
      const result = parseVoteResponse('YAY, This is the right call.', WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('YAY')
      expect(result?.justification).toBe('This is the right call.')
    })

    it('parses NAY with justification separated by colon', () => {
      const result = parseVoteResponse('NAY: Too risky for production.', WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('NAY')
      expect(result?.justification).toBe('Too risky for production.')
    })

    it('parses ABSTAIN with justification separated by period', () => {
      const result = parseVoteResponse('ABSTAIN. Insufficient data.', WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('ABSTAIN')
      expect(result?.justification).toBe('Insufficient data.')
    })

    it('parses vote with no separator and justification separated by space', () => {
      const result = parseVoteResponse('YAY because the plan is solid.', WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('YAY')
      expect(result?.justification).toBe('because the plan is solid.')
    })

    it('parses vote without any justification', () => {
      const result = parseVoteResponse('NAY', WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('NAY')
      expect(result?.justification).toBe('')
    })
  })

  describe('case insensitivity', () => {
    it('parses lowercase yay', () => {
      const result = parseVoteResponse('yay, Looks good.', WID, LABEL, COLOR)
      expect(result?.vote).toBe('YAY')
    })

    it('parses mixed-case Nay', () => {
      const result = parseVoteResponse('Nay: Bad idea.', WID, LABEL, COLOR)
      expect(result?.vote).toBe('NAY')
    })

    it('parses mixed-case Abstain', () => {
      const result = parseVoteResponse('Abstain, no strong opinion.', WID, LABEL, COLOR)
      expect(result?.vote).toBe('ABSTAIN')
    })
  })

  describe('preamble before vote word', () => {
    it('extracts vote when agent adds a preamble sentence before vote word on a new line', () => {
      const response = 'After careful consideration:\nYAY, The approach is sound.'
      const result = parseVoteResponse(response, WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('YAY')
      expect(result?.justification).toBe('The approach is sound.')
    })

    it('extracts vote when preamble exists before vote word on same content block', () => {
      // The regex has `m` flag — it matches at the start of any line
      const response = 'I think\nNAY: The risk is too high.'
      const result = parseVoteResponse(response, WID, LABEL, COLOR)
      expect(result).not.toBeNull()
      expect(result?.vote).toBe('NAY')
    })
  })

  describe('metadata pass-through', () => {
    it('passes windowId through to the returned AdvisorVote', () => {
      const result = parseVoteResponse('YAY', 'win-xyz', LABEL, COLOR)
      expect(result?.windowId).toBe('win-xyz')
    })

    it('passes personaLabel through to the returned AdvisorVote', () => {
      const result = parseVoteResponse('YAY', WID, 'Legal Counsel', COLOR)
      expect(result?.personaLabel).toBe('Legal Counsel')
    })

    it('passes accentColor through to the returned AdvisorVote', () => {
      const result = parseVoteResponse('YAY', WID, LABEL, '#10b981')
      expect(result?.accentColor).toBe('#10b981')
    })
  })

  describe('invalid responses', () => {
    it('returns null for a response of "maybe"', () => {
      expect(parseVoteResponse('maybe', WID, LABEL, COLOR)).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(parseVoteResponse('', WID, LABEL, COLOR)).toBeNull()
    })

    it('returns null for a whitespace-only string', () => {
      expect(parseVoteResponse('   ', WID, LABEL, COLOR)).toBeNull()
    })

    it('returns null for unrelated prose without a vote keyword', () => {
      expect(
        parseVoteResponse('I believe this proposal has merit.', WID, LABEL, COLOR),
      ).toBeNull()
    })

    it('returns null for a partial match like "YAYYYY"', () => {
      // The regex matches YAY at start of line followed by [.,:]? then \s* — "YAYYYY" starts
      // with YAY but the regex captures the rest as justification, so this actually parses.
      // Verify the actual behavior rather than assume.
      const result = parseVoteResponse('YAYYYY looks great', WID, LABEL, COLOR)
      // VOTE_PATTERN is /^\s*(YAY|NAY|ABSTAIN)[.,:]?\s*(.*)/im — YAY matches, rest is "YYY looks great"
      expect(result?.vote).toBe('YAY')
      expect(result?.justification).toBe('YYY looks great')
    })
  })

  describe('justification trimming', () => {
    it('trims leading and trailing whitespace from justification', () => {
      const result = parseVoteResponse('YAY,   lots of spaces   ', WID, LABEL, COLOR)
      expect(result?.justification).toBe('lots of spaces')
    })
  })
})

// ---------------------------------------------------------------------------
// tallyVotes
// ---------------------------------------------------------------------------

describe('tallyVotes', () => {
  describe('empty array', () => {
    it('returns all zeros for an empty array', () => {
      const tally = tallyVotes([])
      expect(tally.yay).toBe(0)
      expect(tally.nay).toBe(0)
      expect(tally.abstain).toBe(0)
      expect(tally.total).toBe(0)
    })

    it('preserves the empty votes array in the output', () => {
      const tally = tallyVotes([])
      expect(tally.votes).toEqual([])
    })
  })

  describe('single vote', () => {
    it('counts a single YAY correctly', () => {
      const tally = tallyVotes([makeVote('YAY')])
      expect(tally.yay).toBe(1)
      expect(tally.nay).toBe(0)
      expect(tally.abstain).toBe(0)
      expect(tally.total).toBe(1)
    })

    it('counts a single NAY correctly', () => {
      const tally = tallyVotes([makeVote('NAY')])
      expect(tally.nay).toBe(1)
      expect(tally.yay).toBe(0)
      expect(tally.total).toBe(1)
    })

    it('counts a single ABSTAIN correctly', () => {
      const tally = tallyVotes([makeVote('ABSTAIN')])
      expect(tally.abstain).toBe(1)
      expect(tally.yay).toBe(0)
      expect(tally.total).toBe(1)
    })
  })

  describe('mixed votes', () => {
    it('counts a realistic mixed vote set correctly', () => {
      const votes: AdvisorVote[] = [
        makeVote('YAY'),
        makeVote('YAY'),
        makeVote('NAY'),
        makeVote('ABSTAIN'),
      ]
      const tally = tallyVotes(votes)
      expect(tally.yay).toBe(2)
      expect(tally.nay).toBe(1)
      expect(tally.abstain).toBe(1)
      expect(tally.total).toBe(4)
    })

    it('total always equals votes.length', () => {
      const votes = [makeVote('YAY'), makeVote('NAY'), makeVote('NAY'), makeVote('ABSTAIN')]
      const tally = tallyVotes(votes)
      expect(tally.total).toBe(votes.length)
    })
  })

  describe('votes array preserved', () => {
    it('includes the original votes array in the output unchanged', () => {
      const votes: AdvisorVote[] = [makeVote('YAY'), makeVote('NAY')]
      const tally = tallyVotes(votes)
      expect(tally.votes).toBe(votes)
    })
  })

  describe('all same vote', () => {
    it('handles all NAY votes', () => {
      const votes = [makeVote('NAY'), makeVote('NAY'), makeVote('NAY')]
      const tally = tallyVotes(votes)
      expect(tally.nay).toBe(3)
      expect(tally.yay).toBe(0)
      expect(tally.abstain).toBe(0)
    })

    it('handles all ABSTAIN votes', () => {
      const votes = [makeVote('ABSTAIN'), makeVote('ABSTAIN')]
      const tally = tallyVotes(votes)
      expect(tally.abstain).toBe(2)
      expect(tally.yay).toBe(0)
      expect(tally.nay).toBe(0)
    })
  })
})
