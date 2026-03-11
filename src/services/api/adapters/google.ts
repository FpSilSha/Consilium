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

function extractTokenUsage(obj: Record<string, unknown>): StreamChunk['tokenUsage'] {
  const usage = obj['usageMetadata'] as Record<string, unknown> | undefined
  if (usage === undefined) return undefined
  const inputTokens = typeof usage['promptTokenCount'] === 'number' ? usage['promptTokenCount'] : undefined
  const outputTokens = typeof usage['candidatesTokenCount'] === 'number' ? usage['candidatesTokenCount'] : undefined
  if (inputTokens === undefined && outputTokens === undefined) return undefined
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  }
}

function parseGoogleEvent(event: unknown): StreamChunk | null {
  if (typeof event !== 'object' || event === null) return null
  const obj = event as Record<string, unknown>

  const candidates = obj['candidates'] as readonly Record<string, unknown>[] | undefined
  const candidate = candidates !== undefined && candidates.length > 0 ? candidates[0]! : undefined
  const finishReason = candidate?.['finishReason']

  // Extract text content if present
  const content = candidate?.['content'] as Record<string, unknown> | undefined
  const parts = content?.['parts'] as readonly Record<string, unknown>[] | undefined
  const rawText = parts !== undefined && parts.length > 0 ? parts[0]!['text'] : undefined
  const text = typeof rawText === 'string' ? rawText : ''

  // Terminal event: finishReason present (STOP, SAFETY, MAX_TOKENS, etc.)
  if (finishReason !== undefined && finishReason !== null) {
    const isPolicyStop =
      finishReason === 'SAFETY' ||
      finishReason === 'RECITATION' ||
      finishReason === 'BLOCKLIST' ||
      finishReason === 'PROHIBITED_CONTENT' ||
      finishReason === 'SPII'
    if (isPolicyStop) {
      const partialNote = text !== '' ? `\n\n[Partial response before block]:\n${text}` : ''
      return {
        type: 'error',
        content: `Response blocked by provider (${String(finishReason)})${partialNote}`,
        tokenUsage: extractTokenUsage(obj),
      }
    }
    return {
      type: 'done',
      content: text,
      tokenUsage: extractTokenUsage(obj),
    }
  }

  // Content delta (mid-stream)
  if (text !== '') {
    return { type: 'content', content: text, tokenUsage: extractTokenUsage(obj) }
  }

  return null
}
