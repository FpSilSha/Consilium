import type { ProviderAdapter, ApiRequestConfig, StreamChunk } from '../types'

export const anthropicAdapter: ProviderAdapter = {
  provider: 'anthropic',

  buildRequest(config: ApiRequestConfig) {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens ?? 4096,
        system: config.systemPrompt,
        stream: true,
        messages: config.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    }
  },

  async *parseStream(reader) {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '' || data === '[DONE]') continue

          try {
            const event: unknown = JSON.parse(data)
            const chunk = parseAnthropicEvent(event)
            if (chunk !== null) yield chunk
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        await reader.cancel().catch(() => {})
        return
      }
      throw error
    } finally {
      reader.releaseLock()
    }
  },
}

function parseAnthropicEvent(event: unknown): StreamChunk | null {
  if (typeof event !== 'object' || event === null) return null
  const obj = event as Record<string, unknown>

  switch (obj['type']) {
    case 'content_block_delta': {
      const delta = obj['delta'] as Record<string, unknown> | undefined
      if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
        return { type: 'content', content: delta['text'] }
      }
      return null
    }

    case 'message_delta': {
      // message_delta carries output_tokens only (input_tokens come from message_start)
      const usage = obj['usage'] as Record<string, unknown> | undefined
      if (usage !== undefined) {
        return {
          type: 'done',
          content: '',
          tokenUsage: {
            inputTokens: 0,
            outputTokens: typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0,
          },
        }
      }
      return null
    }

    case 'message_start': {
      const message = obj['message'] as Record<string, unknown> | undefined
      const usage = message?.['usage'] as Record<string, unknown> | undefined
      if (usage !== undefined && typeof usage['input_tokens'] === 'number') {
        return {
          type: 'content',
          content: '',
          tokenUsage: {
            inputTokens: usage['input_tokens'],
            outputTokens: 0,
          },
        }
      }
      return null
    }

    case 'error': {
      const error = obj['error'] as Record<string, unknown> | undefined
      return {
        type: 'error',
        content: typeof error?.['message'] === 'string' ? error['message'] : 'Unknown error',
      }
    }

    default:
      return null
  }
}
