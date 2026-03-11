export type VoteValue = 'YAY' | 'NAY' | 'ABSTAIN'

export interface AdvisorVote {
  readonly windowId: string
  readonly personaLabel: string
  readonly vote: VoteValue
  readonly justification: string
  readonly accentColor: string
}

export interface VoteTally {
  readonly yay: number
  readonly nay: number
  readonly abstain: number
  readonly total: number
  readonly votes: readonly AdvisorVote[]
}
