export type Provider = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek'

export interface ApiKey {
  readonly id: string
  readonly provider: Provider
  readonly maskedKey: string
  readonly createdAt: number
  readonly verified: boolean
}

export interface ModelInfo {
  readonly id: string
  readonly name: string
  readonly provider: Provider
  readonly contextWindow: number
  readonly inputPricePerToken: number
  readonly outputPricePerToken: number
}
