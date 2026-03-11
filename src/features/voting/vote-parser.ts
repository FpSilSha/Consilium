import type { VoteValue, AdvisorVote, VoteTally } from './vote-types'

// Match YAY/NAY/ABSTAIN at start of any line (agents may add preamble)
const VOTE_PATTERN = /^\s*(YAY|NAY|ABSTAIN)[.,:]?\s*(.*)/im

/**
 * Parses a vote response from an agent.
 * Expected format: "YAY|NAY|ABSTAIN, followed by a one-sentence justification."
 */
export function parseVoteResponse(
  response: string,
  windowId: string,
  personaLabel: string,
  accentColor: string,
): AdvisorVote | null {
  const trimmed = response.trim()
  const match = VOTE_PATTERN.exec(trimmed)
  if (match === null) return null

  const voteStr = match[1]!.toUpperCase()
  if (!isValidVote(voteStr)) return null

  return {
    windowId,
    personaLabel,
    vote: voteStr,
    justification: match[2]?.trim() ?? '',
    accentColor,
  }
}

/**
 * Tallies an array of votes.
 */
export function tallyVotes(votes: readonly AdvisorVote[]): VoteTally {
  const yay = votes.filter((v) => v.vote === 'YAY').length
  const nay = votes.filter((v) => v.vote === 'NAY').length
  const abstain = votes.filter((v) => v.vote === 'ABSTAIN').length

  return { yay, nay, abstain, total: votes.length, votes }
}

function isValidVote(value: string): value is VoteValue {
  return value === 'YAY' || value === 'NAY' || value === 'ABSTAIN'
}
