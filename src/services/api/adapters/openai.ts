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
        ...(config.provider === 'openai'
          ? { max_completion_tokens: config.maxTokens ?? 4096 }
          : { max_tokens: config.maxTokens ?? 4096 }),
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


        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = done ? '' : lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '' || data === '[DONE]') continue

          try {
            const event: unknown = JSON.parse(data)
            const chunk = parseOpenAIEvent(event)
            if (chunk !== null) yield chunk
          } catch {
            // Skip malformed JSON lines
          }
        }
        if (done) break
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
  const error = obj['error']
  if (error != null) {
    const message = typeof error === 'object' ? (error as Record<string, unknown>)['message'] : error
    return { type: 'error', content: typeof message === 'string' ? message : 'Provider stream failed' }
  }
  const rawUsage = obj['usage']
  const usage = rawUsage != null && typeof rawUsage === 'object' ? rawUsage as Record<string, unknown> : undefined
  const tokenCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  const tokenUsage = usage == null ? undefined : {
    inputTokens: tokenCount(usage['prompt_tokens']), outputTokens: tokenCount(usage['completion_tokens']),
  }
  const choices = obj['choices']
  const choice = Array.isArray(choices) && choices[0] != null && typeof choices[0] === 'object'
    ? choices[0] as Record<string, unknown> : undefined
  if (choice != null) {
    if (choice['finish_reason'] === 'error') return { type: 'error', content: 'Provider stream failed', tokenUsage }
    if (choice['finish_reason'] === 'content_filter') return { type: 'error', content: 'Response blocked by provider content filter', tokenUsage }
    const delta = choice['delta']
    if (delta != null && typeof delta === 'object') {
      const content = (delta as Record<string, unknown>)['content']
      if (typeof content === 'string' && content !== '') {
        return { type: 'content', content, ...(tokenUsage == null ? {} : { tokenUsage }) }
      }
    }
  }
  return tokenUsage == null ? null : { type: 'done', content: '', tokenUsage }
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
