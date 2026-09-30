import type { ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { catalogJson, entries, positiveNumber, priceNumber, runCatalogFetch, strings } from './catalog-request'

export function fetchXAICatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  return runCatalogFetch('xai', async (requestSignal) => {
    const json = await catalogJson('https://api.x.ai/v1/language-models', { Authorization: 'Bearer ' + apiKey }, requestSignal)
    return entries(json, 'models').flatMap((raw): ModelInfo[] => {
      if (typeof raw['id'] !== 'string' || raw['id'].trim() === '') return []
      const outputModalities = strings(raw['output_modalities'])
      if (outputModalities != null && !outputModalities.includes('text')) return []
      const input = priceNumber(raw['prompt_text_token_price'])
      const output = priceNumber(raw['completion_text_token_price'])
      // xAI reports USD cents per 100 million tokens.
      return [{
        id: raw['id'], name: raw['id'], provider: 'xai',
        contextWindow: positiveNumber(raw['context_length']),
        inputPricePerToken: (input ?? 0) / 10_000_000_000,
        outputPricePerToken: (output ?? 0) / 10_000_000_000,
        pricingKnown: input !== undefined && output !== undefined,
        inputModalities: strings(raw['input_modalities']), outputModalities,
      }]
    })
  }, signal)
}
