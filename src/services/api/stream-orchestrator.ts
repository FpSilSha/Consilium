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
 * Returns an AbortController for cancellation.
 */
export function streamResponse(
  config: ApiRequestConfig,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController()
  const adapter = getAdapter(config.provider)

  const configWithSignal: ApiRequestConfig = {
    ...config,
    signal: config.signal ?? controller.signal,
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
    const errorText = await response.text().catch(() => 'Unknown error')
    callbacks.onError(`API error ${response.status}: ${errorText}`)
    return
  }

  const reader = response.body?.getReader()
  if (reader === undefined) {
    callbacks.onError('No response body')
    return
  }

  let fullContent = ''
  let finalUsage: StreamChunk['tokenUsage'] | undefined

  for await (const chunk of adapter.parseStream(reader)) {
    switch (chunk.type) {
      case 'content':
        fullContent += chunk.content
        if (chunk.content !== '') {
          callbacks.onChunk(chunk.content)
        }
        if (chunk.tokenUsage !== undefined) {
          finalUsage = chunk.tokenUsage
        }
        break

      case 'done':
        fullContent += chunk.content
        if (chunk.tokenUsage !== undefined) {
          finalUsage = chunk.tokenUsage
        }
        callbacks.onDone(fullContent, finalUsage)
        return

      case 'error':
        callbacks.onError(chunk.content)
        return
    }
  }

  // Stream ended without explicit 'done' event
  callbacks.onDone(fullContent, finalUsage)
}
