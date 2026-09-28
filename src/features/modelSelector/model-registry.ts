import type { ModelInfo, Provider } from '@/types'

// Offline shortlist checked 2026-09-21. Live catalogs take precedence.
// Sources and pricing limitations: docs/PROVIDER-CATALOGS.md.
function model(id: string, name: string, provider: Provider, contextWindow: number, input?: number, output?: number, maxOutputTokens?: number): ModelInfo {
  return { id, name, provider, contextWindow, maxOutputTokens,
    inputPricePerToken: (input ?? 0) / 1_000_000, outputPricePerToken: (output ?? 0) / 1_000_000,
    pricingKnown: input != null && output != null, pricingSource: 'fallback' }
}
const MODELS: readonly ModelInfo[] = [
  model('claude-fable-5-1', 'Claude Fable 5.1', 'anthropic', 1000000, 10, 50, 128000),
  model('claude-opus-5', 'Claude Opus 5', 'anthropic', 1000000, 5, 25, 128000),
  model('claude-sonnet-5', 'Claude Sonnet 5', 'anthropic', 1000000, 2, 10, 128000),
  model('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'anthropic', 200000, 1, 5, 64000),
  model('claude-opus-4-6', 'Claude Opus 4.6', 'anthropic', 1000000, 5, 25, 128000),
  model('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'anthropic', 1000000, 3, 15, 128000),
  model('gpt-6-astra', 'GPT-6 Astra', 'openai', 1050000, 10, 50, 128000),
  model('gpt-5.6-sol', 'GPT-5.6 Sol', 'openai', 1050000, 2, 10, 128000),
  model('gpt-5.6-terra', 'GPT-5.6 Terra', 'openai', 1050000, 2, 12, 128000),
  model('gpt-5.6-luna', 'GPT-5.6 Luna', 'openai', 1050000, 0.2, 1.2, 128000),
  model('gpt-4o', 'GPT-4o', 'openai', 128000, 2.5, 10),
  model('gpt-4o-mini', 'GPT-4o mini', 'openai', 128000, 0.15, 0.6),
  model('gemini-3.8-flash', 'Gemini 3.8 Flash', 'google', 1048576, 0.75, 3.75, 65536),
  model('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'google', 1048576, 0.3, 2.5, 65536),
  model('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'google', 1048576, 2, 12, 65536),
  model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'google', 1048576, 1.25, 10),
  model('grok-4.7', 'Grok 4.7', 'xai', 500000, 1.6, 4.8, 450000),
  model('deepseek-flash', 'DeepSeek Flash', 'deepseek', 1048576),
  model('deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek', 1048576),
]
// Keep historical IDs readable without recommending them for new sessions.
const HISTORICAL_MODELS: readonly ModelInfo[] = [
  model('o3', 'o3', 'openai', 200000, 2, 8),
  model('gemini-2.0-flash', 'Gemini 2.0 Flash', 'google', 1000000, 0.1, 0.4),
  model('grok-3', 'Grok-3', 'xai', 131072, 3, 15),
  model('grok-3-mini', 'Grok-3 mini', 'xai', 131072, 0.3, 0.5),
  model('deepseek-chat', 'DeepSeek Chat', 'deepseek', 128000, 0.27, 1.1),
  model('deepseek-reasoner', 'DeepSeek Reasoner', 'deepseek', 128000, 0.55, 2.2),
]
export function getModelsForProvider(provider: Provider, dynamicModels?: readonly ModelInfo[]): readonly ModelInfo[] {
  if (dynamicModels != null) return dynamicModels.filter((entry) => entry.provider === provider)
  return MODELS.filter((entry) => entry.provider === provider)
}
export function getModelById(modelId: string, dynamicModels?: readonly ModelInfo[]): ModelInfo | undefined {
  return dynamicModels?.find((entry) => entry.id === modelId)
    ?? MODELS.find((entry) => entry.id === modelId) ?? HISTORICAL_MODELS.find((entry) => entry.id === modelId)
}
export function getAllModels(dynamicModels?: readonly ModelInfo[]): readonly ModelInfo[] {
  if (dynamicModels == null || dynamicModels.length === 0) return MODELS
  const dynamicIds = new Set(dynamicModels.map((entry) => entry.provider + ':' + entry.id))
  return [...MODELS.filter((entry) => !dynamicIds.has(entry.provider + ':' + entry.id)), ...dynamicModels]
}
