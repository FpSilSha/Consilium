import type { Provider } from '@/types'
import type { ApiRequestConfig, StreamChunk, ProviderAdapter } from './types'
import { anthropicAdapter } from './adapters/anthropic'
import { openaiAdapter } from './adapters/openai'
import { googleAdapter } from './adapters/google'
import { xaiAdapter, deepseekAdapter } from './adapters/openai-compatible'

const adapters: Readonly<Record<Provider, ProviderAdapter>> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  xai: xaiAdapter,
  deepseek: deepseekAdapter,
}

export function getAdapter(provider: Provider): ProviderAdapter {
  return adapters[provider]
}

export interface StreamCallbacks {
  onChunk: (content: string) => void
  onDone: (fullContent: string, tokenUsage?: StreamChunk['tokenUsage']) => void
  onError: (error: string) => void
}

/**
 * Streams a response from a provider's API.
 *
 * **Cancellation contract:**
 * - If `config.signal` is provided, the caller owns cancellation; the returned
 *   AbortController is a **separate** controller that only governs the internal
 *   fetch and will NOT abort the caller's signal.  Callers should use their own
 *   signal/controller for lifecycle management.
 * - If `config.signal` is omitted, the returned AbortController is wired
 *   directly to the fetch and can be used to cancel the stream.
 */
export function streamResponse(
  config: ApiRequestConfig,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController()
  const adapter = getAdapter(config.provider)
  const effectiveSignal = config.signal ?? controller.signal

  const configWithSignal: ApiRequestConfig = {
    ...config,
    signal: effectiveSignal,
  }

  runStream(adapter, configWithSignal, callbacks).catch((error) => {
    if (effectiveSignal.aborted) return
    callbacks.onError(
      error instanceof Error ? error.message : 'Unknown streaming error',
    )
  })

  return controller
}

async function runStream(
  adapter: ProviderAdapter,
  config: ApiRequestConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { url, headers, body } = adapter.buildRequest(config)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: config.signal ?? null,
  })

  if (!response.ok) {
    const statusCode = response.status
    const sanitizedMessage = statusCode === 401
      ? 'Authentication failed — check your API key'
      : statusCode === 429
        ? 'Rate limit exceeded — try again later'
        : statusCode === 403
          ? 'Access forbidden — check API key permissions'
          : statusCode >= 500
            ? `Provider server error (${statusCode})`
            : `API error (${statusCode})`
    callbacks.onError(sanitizedMessage)
    return
  }

  const reader = response.body?.getReader()
  if (reader === undefined) {
    callbacks.onError('No response body')
    return
  }

  let fullContent = ''
  let accumulatedInputTokens = 0
  let accumulatedOutputTokens = 0

  for await (const chunk of adapter.parseStream(reader)) {
    switch (chunk.type) {
      case 'content':
        fullContent += chunk.content
        if (chunk.content !== '') {
          callbacks.onChunk(chunk.content)
        }
        if (chunk.tokenUsage !== undefined) {
          accumulatedInputTokens = Math.max(accumulatedInputTokens, chunk.tokenUsage.inputTokens)
          accumulatedOutputTokens = Math.max(accumulatedOutputTokens, chunk.tokenUsage.outputTokens)
        }
        break

      case 'done':
        fullContent += chunk.content
        if (chunk.tokenUsage !== undefined) {
          accumulatedInputTokens = Math.max(accumulatedInputTokens, chunk.tokenUsage.inputTokens)
          accumulatedOutputTokens = Math.max(accumulatedOutputTokens, chunk.tokenUsage.outputTokens)
        }
        callbacks.onDone(fullContent, accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
          ? { inputTokens: accumulatedInputTokens, outputTokens: accumulatedOutputTokens }
          : undefined)
        return

      case 'error':
        callbacks.onError(chunk.content)
        return
    }
  }

  // Stream ended without explicit 'done' event
  callbacks.onDone(fullContent, accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
    ? { inputTokens: accumulatedInputTokens, outputTokens: accumulatedOutputTokens }
    : undefined)
}
