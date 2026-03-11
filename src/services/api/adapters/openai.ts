import type { ProviderAdapter, ApiRequestConfig, StreamChunk } from '../types'

export const openaiAdapter: ProviderAdapter = {
  provider: 'openai',

  buildRequest(config: ApiRequestConfig) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens ?? 4096,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: config.systemPrompt },
          ...config.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ],
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
            const chunk = parseOpenAIEvent(event)
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

function parseOpenAIEvent(event: unknown): StreamChunk | null {
  if (typeof event !== 'object' || event === null) return null
  const obj = event as Record<string, unknown>

  const choices = obj['choices'] as readonly Record<string, unknown>[] | undefined

  if (choices !== undefined && choices.length > 0) {
    const choice = choices[0]!
    const delta = choice['delta'] as Record<string, unknown> | undefined

    if (delta !== undefined && typeof delta['content'] === 'string') {
      return { type: 'content', content: delta['content'] }
    }

    // finish_reason without usage: don't emit done yet — wait for the
    // separate usage event that arrives after (stream_options.include_usage)
    if (choice['finish_reason'] !== null && choice['finish_reason'] !== undefined) {
      return null
    }
  }

  // Usage-only event (stream_options.include_usage) — this arrives after
  // the finish_reason event and carries the final token counts
  const usage = obj['usage'] as Record<string, unknown> | undefined
  if (usage !== undefined) {
    return {
      type: 'done',
      content: '',
      tokenUsage: {
        inputTokens: typeof usage['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : 0,
        outputTokens: typeof usage['completion_tokens'] === 'number' ? usage['completion_tokens'] : 0,
      },
    }
  }

  return null
}
