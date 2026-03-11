export type TurnMode = 'sequential' | 'parallel' | 'manual' | 'queue'

export type QueueCardStatus = 'waiting' | 'active' | 'completed' | 'errored' | 'skipped'

export interface QueueCard {
  readonly id: string
  readonly windowId: string
  readonly isUser: boolean
  readonly status: QueueCardStatus
  readonly errorLabel: string | null
}
