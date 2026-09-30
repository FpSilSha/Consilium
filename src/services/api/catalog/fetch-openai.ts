import type { CatalogFetchResult } from './catalog-types'
import { fetchOpenAICompatibleCatalog } from './fetch-openai-compat'

/** /models includes embeddings, media models and Responses-only models. */
export function isOpenAIChatModel(modelId: string): boolean {
  const id = modelId.startsWith('ft:') ? modelId.split(':')[1] ?? '' : modelId
  if (!/^(?:gpt-(?:[3-9]|\d{2,})|o[1-9](?:-|$)|chatgpt-)/.test(id)) return false
  return !/(?:^|-)(?:audio|realtime|transcribe|tts|image|search|deep-research|codex|pro)(?:-|$)/.test(id)
}

export async function fetchOpenAICatalog(apiKey: string, signal?: AbortSignal): Promise<CatalogFetchResult> {
  const result = await fetchOpenAICompatibleCatalog('openai', 'https://api.openai.com/v1/models', apiKey, signal)
  return { ...result, models: result.models.filter((model) => isOpenAIChatModel(model.id)) }
}
