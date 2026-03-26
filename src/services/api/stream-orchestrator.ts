import type { Provider } from '@/types'
import type { KnownProvider } from '@/features/keys/key-detection'
import type { ApiRequestConfig, StreamChunk, ProviderAdapter } from './types'
import { anthropicAdapter } from './adapters/anthropic'
import { openaiAdapter } from './adapters/openai'
import { googleAdapter } from './adapters/google'
import { xaiAdapter, deepseekAdapter, openrouterAdapter } from './adapters/openai-compatible'

const adapters: Readonly<Record<KnownProvider, ProviderAdapter>> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  xai: xaiAdapter,
  deepseek: deepseekAdapter,
  openrouter: openrouterAdapter,
}

export function getAdapter(provider: Provider): ProviderAdapter {
  if (provider === 'custom') {
    // Custom providers use OpenAI-compatible API
    return openaiAdapter
  }
  return adapters[provider]
}

export interface StreamCallbacks {
  onChunk: (content: string) => void
  onDone: (fullContent: string, tokenUsage?: StreamChunk['tokenUsage']) => void
  onError: (error: string, tokenUsage?: StreamChunk['tokenUsage']) => void
}

/**
 * Streams a response from a provider's API.
 *
 * Returns an AbortController that can always be used to cancel the stream.
 * If `config.signal` is provided, it is linked to the internal controller:
 * aborting either one cancels the fetch. The returned controller's
 * `signal.aborted` reflects the true cancellation state for call-site checks.
 */
export function streamResponse(
  config: ApiRequestConfig,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController()
  const adapter = getAdapter(config.provider)

  // Link external signal to internal controller so both can cancel
  if (config.signal !== undefined) {
    if (config.signal.aborted) {
      controller.abort(config.signal.reason)
    } else {
      config.signal.addEventListener(
        'abort',
        () => controller.abort(config.signal!.reason),
        { once: true },
      )
    }
  }

  const configWithSignal: ApiRequestConfig = {
    ...config,
    signal: controller.signal,
  }

  runStream(adapter, configWithSignal, callbacks).catch((error) => {
    if (controller.signal.aborted) return
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
        if (chunk.tokenUsage !== undefined) {
          accumulatedInputTokens = Math.max(accumulatedInputTokens, chunk.tokenUsage.inputTokens)
          accumulatedOutputTokens = Math.max(accumulatedOutputTokens, chunk.tokenUsage.outputTokens)
        }
        callbacks.onError(
          chunk.content,
          accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
            ? { inputTokens: accumulatedInputTokens, outputTokens: accumulatedOutputTokens }
            : undefined,
        )
        return
    }
  }

  // Stream ended without explicit 'done' event
  callbacks.onDone(fullContent, accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
    ? { inputTokens: accumulatedInputTokens, outputTokens: accumulatedOutputTokens }
    : undefined)
}
