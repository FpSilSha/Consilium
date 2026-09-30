import type { ModelInfo } from '@/types'
import type { CatalogFetchResult } from './catalog-types'
import { catalogJson, entries, isRecord, positiveNumber, priceNumber, runCatalogFetch, strings } from './catalog-request'

/** Public endpoint: omit offset/limit to receive the entire text-model catalog. */
export function fetchOpenRouterCatalog(signal?: AbortSignal): Promise<CatalogFetchResult> {
  return runCatalogFetch('openrouter', async (requestSignal) => {
    const json = await catalogJson('https://openrouter.ai/api/v1/models', {}, requestSignal)
    return entries(json, 'data').flatMap((raw): ModelInfo[] => {
      if (typeof raw['id'] !== 'string' || raw['id'].trim() === '' || raw['id'].endsWith(':batch')) return []
      if (typeof raw['name'] !== 'string' || raw['name'].trim() === '') return []
      const architecture = isRecord(raw['architecture']) ? raw['architecture'] : {}
      const inputModalities = strings(architecture['input_modalities'])
      const outputModalities = strings(architecture['output_modalities'])
      if (outputModalities != null && !outputModalities.includes('text')) return []
      if (inputModalities != null && !inputModalities.includes('text')) return []
      const pricing = isRecord(raw['pricing']) ? raw['pricing'] : {}
      const topProvider = isRecord(raw['top_provider']) ? raw['top_provider'] : {}
      const input = priceNumber(pricing['prompt'])
      const output = priceNumber(pricing['completion'])
      return [{
        id: raw['id'], name: raw['name'], provider: 'openrouter',
        contextWindow: positiveNumber(raw['context_length']) || positiveNumber(topProvider['context_length']),
        maxOutputTokens: positiveNumber(topProvider['max_completion_tokens']) || undefined,
        inputPricePerToken: input ?? 0, outputPricePerToken: output ?? 0,
        pricingKnown: input !== undefined && output !== undefined,
        inputModalities, outputModalities,
        supportedParameters: strings(raw['supported_parameters']),
      }]
    })
  }, signal, 30_000)
}
