import type { Provider, Attachment } from '@/types'

export interface StreamChunk {
  readonly type: 'content' | 'done' | 'error'
  readonly content: string
  readonly tokenUsage?: TokenUsage | undefined
}

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface ApiRequestConfig {
  readonly provider: Provider
  readonly model: string
  readonly apiKey: string
  readonly systemPrompt: string
  readonly messages: readonly ApiMessage[]
  readonly maxTokens?: number | undefined
  readonly signal?: AbortSignal | undefined
  /** Base URL for custom providers — overrides the adapter's default endpoint */
  readonly baseUrl?: string | undefined
}

export interface ApiMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly attachments?: readonly Attachment[] | undefined
}

export interface ProviderAdapter {
  readonly provider: Provider
  buildRequest(config: ApiRequestConfig): {
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly body: string
  }
  parseStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<StreamChunk>
}
