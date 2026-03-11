import type { ProviderAdapter, ApiRequestConfig, StreamChunk } from '../types'

export const googleAdapter: ProviderAdapter = {
  provider: 'google',

  buildRequest(config: ApiRequestConfig) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse`

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: config.systemPrompt }],
        },
        contents: config.messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: config.maxTokens ?? 4096,
        },
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
          if (data === '') continue

          try {
            const event: unknown = JSON.parse(data)
            const chunk = parseGoogleEvent(event)
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

function parseGoogleEvent(event: unknown): StreamChunk | null {
  if (typeof event !== 'object' || event === null) return null
  const obj = event as Record<string, unknown>

  const candidates = obj['candidates'] as readonly Record<string, unknown>[] | undefined
  if (candidates !== undefined && candidates.length > 0) {
    const candidate = candidates[0]!
    const content = candidate['content'] as Record<string, unknown> | undefined
    const parts = content?.['parts'] as readonly Record<string, unknown>[] | undefined

    if (parts !== undefined && parts.length > 0) {
      const text = parts[0]!['text']
      if (typeof text === 'string') {
        const finishReason = candidate['finishReason']
        const usage = obj['usageMetadata'] as Record<string, unknown> | undefined

        if (finishReason !== undefined && finishReason !== null) {
          return {
            type: 'done',
            content: text,
            tokenUsage: usage !== undefined
              ? {
                  inputTokens: typeof usage['promptTokenCount'] === 'number' ? usage['promptTokenCount'] : 0,
                  outputTokens: typeof usage['candidatesTokenCount'] === 'number' ? usage['candidatesTokenCount'] : 0,
                }
              : undefined,
          }
        }

        return { type: 'content', content: text }
      }
    }
  }

  return null
}
