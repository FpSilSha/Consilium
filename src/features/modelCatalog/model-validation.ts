import type { Provider } from '@/types'
import { streamResponse } from '@/services/api/stream-orchestrator'

export interface ModelTestResult {
  readonly valid: boolean
  readonly error?: string | undefined
}

/**
 * Providers that have free model listing endpoints — testing a model
 * on these providers can be done without cost by checking the catalog.
 */
const FREE_VALIDATION_PROVIDERS: ReadonlySet<Provider> = new Set([
  'openai', 'google', 'xai', 'deepseek', 'openrouter',
])

/**
 * Returns true if testing a model on this provider will incur cost.
 * Anthropic and custom providers have no free validation endpoint.
 */
export function testWillCost(provider: Provider): boolean {
  return !FREE_VALIDATION_PROVIDERS.has(provider)
}

/**
 * Tests whether a model ID is valid by sending a minimal prompt.
 * Uses the cheapest possible request: max_tokens=1, single-word prompt.
 */
export async function testModelId(
  provider: Provider,
  modelId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelTestResult> {
  return new Promise((resolve) => {
    const controller = streamResponse(
      {
        provider,
        model: modelId,
        apiKey,
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 1,
        signal,
      },
      {
        onChunk: () => {},
        onDone: () => { resolve({ valid: true }) },
        onError: (error) => { resolve({ valid: false, error }) },
      },
    )

    // If caller aborts, resolve as cancelled (signal is already linked via streamResponse)
    signal?.addEventListener('abort', () => {
      resolve({ valid: false, error: 'Cancelled' })
    }, { once: true })
  })
}
