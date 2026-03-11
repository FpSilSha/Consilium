import type { ProviderAdapter, ApiRequestConfig } from '../types'
import { openaiAdapter } from './openai'

/**
 * Creates an adapter for OpenAI-compatible APIs (xAI, DeepSeek).
 * These providers use the same request/response format as OpenAI
 * but with different base URLs.
 */
function createOpenAICompatibleAdapter(
  provider: ProviderAdapter['provider'],
  baseUrl: string,
): ProviderAdapter {
  return {
    provider,

    buildRequest(config: ApiRequestConfig) {
      const base = openaiAdapter.buildRequest(config)
      return {
        ...base,
        url: `${baseUrl}/chat/completions`,
      }
    },

    parseStream: openaiAdapter.parseStream,
  }
}

export const xaiAdapter = createOpenAICompatibleAdapter(
  'xai',
  'https://api.x.ai/v1',
)

export const deepseekAdapter = createOpenAICompatibleAdapter(
  'deepseek',
  'https://api.deepseek.com/v1',
)
