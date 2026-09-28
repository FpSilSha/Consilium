export type Provider = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' | 'openrouter' | 'custom'

export interface ApiKey {
  readonly id: string
  readonly provider: Provider
  readonly maskedKey: string
  readonly createdAt: number
  readonly verified: boolean
  readonly baseUrl?: string | undefined
  /** Links to a CustomAdapterDefinition when provider='custom' and format is non-OpenAI */
  readonly adapterDefinitionId?: string | undefined
}

export interface ModelInfo {
  readonly id: string
  readonly name: string
  readonly provider: Provider
  readonly contextWindow: number
  readonly inputPricePerToken: number
  readonly outputPricePerToken: number
  readonly pricingKnown?: boolean | undefined
  readonly pricingSource?: 'provider' | 'reference' | 'fallback' | undefined
  readonly maxOutputTokens?: number | undefined
  readonly inputModalities?: readonly string[] | undefined
  readonly outputModalities?: readonly string[] | undefined
  readonly supportedParameters?: readonly string[] | undefined
  readonly isCustom?: boolean | undefined
}
