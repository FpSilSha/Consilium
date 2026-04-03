import type { CustomResponseTemplate } from '@/types'
import type { StreamChunk } from '../../types'
import { getByPath } from './field-accessor'

/**
 * Creates an async generator that parses a streaming response according
 * to a custom response template. Supports SSE and NDJSON formats.
 *
 * Uses getByPath to extract content, done signals, errors, and token
 * usage from each parsed JSON event based on the template's configured paths.
 */
export function createCustomStreamParser(
  template: CustomResponseTemplate,
): (reader: ReadableStreamDefaultReader<Uint8Array>) => AsyncGenerator<StreamChunk> {
  return template.streamFormat === 'sse'
    ? (reader) => parseSSEStream(reader, template)
    : (reader) => parseNDJSONStream(reader, template)
}

async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  template: CustomResponseTemplate,
): AsyncGenerator<StreamChunk> {
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

        // Check for done sentinel
        if (template.doneSentinel != null && data === template.doneSentinel) continue

        let event: unknown
        try {
          event = JSON.parse(data)
        } catch {
          continue // skip malformed JSON
        }

        const chunk = extractChunk(event, template)
        if (chunk != null) yield chunk
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
}

async function* parseNDJSONStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  template: CustomResponseTemplate,
): AsyncGenerator<StreamChunk> {
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
        const trimmed = line.trim()
        if (trimmed === '') continue

        let event: unknown
        try {
          event = JSON.parse(trimmed)
        } catch {
          continue
        }

        const chunk = extractChunk(event, template)
        if (chunk != null) yield chunk
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
}

/**
 * Extracts a StreamChunk from a parsed JSON event using the template's
 * configured field paths. Returns null if the event is not actionable.
 */
function extractChunk(event: unknown, template: CustomResponseTemplate): StreamChunk | null {
  if (event == null || typeof event !== 'object') return null

  // Event type routing (Anthropic-style)
  if (template.eventTypeField != null) {
    const eventType = getByPath(event, template.eventTypeField) as string | undefined

    // Error event
    if (template.errorEventType != null && eventType === template.errorEventType) {
      const errorMsg = template.errorMessagePath != null
        ? String(getByPath(event, template.errorMessagePath) ?? 'Unknown error')
        : 'Unknown error'
      return { type: 'error', content: errorMsg }
    }

    // Done event
    if (template.doneEventType != null && eventType === template.doneEventType) {
      return {
        type: 'done',
        content: '',
        tokenUsage: extractTokenUsage(event, template),
      }
    }

    // Content event — only extract if type matches (when configured)
    if (template.contentEventType != null && eventType !== template.contentEventType) {
      // Check for token usage in non-content events (e.g. message_start)
      const usage = extractTokenUsage(event, template)
      if (usage != null && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
        return { type: 'content', content: '', tokenUsage: usage }
      }
      return null
    }
  }

  // Check for done via field path
  if (template.doneFieldPath != null) {
    const doneValue = getByPath(event, template.doneFieldPath)
    if (doneValue != null && doneValue !== false && doneValue !== '') {
      return {
        type: 'done',
        content: '',
        tokenUsage: extractTokenUsage(event, template),
      }
    }
  }

  // Check for standalone usage event (no content, has usage)
  const usage = extractTokenUsage(event, template)
  if (usage != null && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
    const content = getByPath(event, template.contentPath)
    if (content == null || content === '') {
      return { type: 'done', content: '', tokenUsage: usage }
    }
  }

  // Extract content
  const content = getByPath(event, template.contentPath)
  if (typeof content === 'string' && content !== '') {
    return {
      type: 'content',
      content,
      tokenUsage: usage ?? undefined,
    }
  }

  return null
}

function extractTokenUsage(
  event: unknown,
  template: CustomResponseTemplate,
): { inputTokens: number; outputTokens: number } | undefined {
  if (template.inputTokensPath == null && template.outputTokensPath == null) return undefined

  const input = template.inputTokensPath != null
    ? getByPath(event, template.inputTokensPath)
    : undefined
  const output = template.outputTokensPath != null
    ? getByPath(event, template.outputTokensPath)
    : undefined

  const inputTokens = typeof input === 'number' ? input : 0
  const outputTokens = typeof output === 'number' ? output : 0

  if (inputTokens === 0 && outputTokens === 0) return undefined

  return { inputTokens, outputTokens }
}
