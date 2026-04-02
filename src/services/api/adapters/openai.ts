import type { Attachment } from '@/types'
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
            content: buildOpenAIContent(m.content, m.attachments),
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

  // Check for usage first — some providers send it alongside choices,
  // others send it as a standalone event after finish_reason.
  const usage = obj['usage'] as Record<string, unknown> | undefined | null
  if (usage != null && typeof usage === 'object') {
    const inputTokens = typeof usage['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : 0
    const outputTokens = typeof usage['completion_tokens'] === 'number' ? usage['completion_tokens'] : 0
    if (inputTokens > 0 || outputTokens > 0) {
      return {
        type: 'done',
        content: '',
        tokenUsage: { inputTokens, outputTokens },
      }
    }
  }

  const choices = obj['choices'] as readonly Record<string, unknown>[] | undefined

  if (choices !== undefined && choices.length > 0) {
    const choice = choices[0]!
    const delta = choice['delta'] as Record<string, unknown> | undefined

    if (delta !== undefined && typeof delta['content'] === 'string') {
      return { type: 'content', content: delta['content'] }
    }

    const finishReason = choice['finish_reason']
    if (finishReason !== null && finishReason !== undefined) {
      if (finishReason === 'content_filter') {
        return { type: 'error', content: 'Response blocked by provider content filter' }
      }
      return null // wait for usage event
    }
  }

  return null
}

/**
 * Builds OpenAI-compatible message content.
 * Plain text when no attachments, content array for multimodal.
 */
function buildOpenAIContent(
  text: string,
  attachments?: readonly Attachment[],
): string | readonly Record<string, unknown>[] {
  if (attachments == null || attachments.length === 0) return text

  const parts: Record<string, unknown>[] = [
    { type: 'text', text },
  ]

  for (const att of attachments) {
    if (att.type === 'image') {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${att.mimeType};base64,${att.data}` },
      })
    } else {
      // Text files — append as additional text content
      parts.push({
        type: 'text',
        text: `[File: ${att.name}]\n${att.data}`,
      })
    }
  }

  return parts
}
