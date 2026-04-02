export interface CostMetadata {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCost: number
  readonly isEstimate: boolean
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
