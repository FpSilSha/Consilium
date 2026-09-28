import type { Provider } from '@/types'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { fetchProviderCatalog } from '@/services/api/catalog/fetch-all-catalogs'
export interface ModelTestResult {
  readonly valid: boolean
  readonly error?: string | undefined
}
export function testWillCost(provider: Provider): boolean { return provider === 'custom' }
/** Built-in providers validate without generating billable text. */
export async function testModelId(provider: Provider, modelId: string, apiKey: string, signal?: AbortSignal): Promise<ModelTestResult> {
  if (signal?.aborted) return { valid: false, error: 'Cancelled' }
  if (provider !== 'custom') {
    try {
      const result = await fetchProviderCatalog(provider, apiKey, signal)
      if (result.error != null) return { valid: false, error: result.error }
      return result.models.some((model) => model.id === modelId)
        ? { valid: true } : { valid: false, error: 'Model is not in the available chat catalog' }
    } catch { return { valid: false, error: signal?.aborted ? 'Cancelled' : 'Could not validate model' } }
  }
  return new Promise((resolve) => {
    const finish = (result: ModelTestResult) => { signal?.removeEventListener('abort', cancel); resolve(result) }
    const cancel = () => finish({ valid: false, error: 'Cancelled' })
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      streamResponse({ provider, model: modelId, apiKey, systemPrompt: '', messages: [{ role: 'user', content: 'hi' }], maxTokens: 1, signal }, {
        onChunk: () => {}, onDone: () => finish({ valid: true }), onError: (error) => finish({ valid: false, error }),
      })
    } catch { finish({ valid: false, error: 'Could not validate model' }) }
  })
}
