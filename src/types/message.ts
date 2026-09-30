export interface CostMetadata {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCost: number
  readonly isEstimate: boolean
  /**
   * How the call was paid for. Absent means a legacy API-billed message.
   * `subscription` usage has no per-call price: its `estimatedCost` of 0 means
   * "nothing added to API spend", never "free" or "measured $0".
   */
  readonly billing?: 'api' | 'subscription' | undefined
}

export interface Attachment {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  /** Base64-encoded content for binary files (images), or plain text for text files */
  readonly data: string
  readonly type: 'image' | 'text'
  readonly sizeBytes: number
}

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly personaLabel: string
  readonly timestamp: number
  readonly windowId: string
  readonly costMetadata?: CostMetadata | undefined
  readonly attachments?: readonly Attachment[] | undefined
}
