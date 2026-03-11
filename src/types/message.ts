export interface CostMetadata {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCost: number
  readonly isEstimate: boolean
}

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly personaLabel: string
  readonly timestamp: number
  readonly windowId: string
  readonly costMetadata?: CostMetadata | undefined
}
