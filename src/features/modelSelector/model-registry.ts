import type { ModelInfo, Provider } from '@/types'

const MODELS: readonly ModelInfo[] = [
  // Anthropic
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', contextWindow: 200000, inputPricePerToken: 0.000015, outputPricePerToken: 0.000075 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', contextWindow: 200000, inputPricePerToken: 0.000003, outputPricePerToken: 0.000015 },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', contextWindow: 200000, inputPricePerToken: 0.0000008, outputPricePerToken: 0.000004 },

  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, inputPricePerToken: 0.0000025, outputPricePerToken: 0.00001 },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', contextWindow: 128000, inputPricePerToken: 0.00000015, outputPricePerToken: 0.0000006 },
  { id: 'o3', name: 'o3', provider: 'openai', contextWindow: 200000, inputPricePerToken: 0.00001, outputPricePerToken: 0.00004 },

  // Google
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', contextWindow: 1000000, inputPricePerToken: 0.00000010, outputPricePerToken: 0.00000040 },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 1000000, inputPricePerToken: 0.00000125, outputPricePerToken: 0.00001 },

  // xAI
  { id: 'grok-3', name: 'Grok-3', provider: 'xai', contextWindow: 131072, inputPricePerToken: 0.000003, outputPricePerToken: 0.000015 },
  { id: 'grok-3-mini', name: 'Grok-3 mini', provider: 'xai', contextWindow: 131072, inputPricePerToken: 0.0000003, outputPricePerToken: 0.0000005 },

  // DeepSeek
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', contextWindow: 128000, inputPricePerToken: 0.00000027, outputPricePerToken: 0.0000011 },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', contextWindow: 128000, inputPricePerToken: 0.00000055, outputPricePerToken: 0.0000022 },
]

export function getModelsForProvider(provider: Provider): readonly ModelInfo[] {
  return MODELS.filter((m) => m.provider === provider)
}

export function getModelById(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId)
}

export function getAllModels(): readonly ModelInfo[] {
  return MODELS
}
