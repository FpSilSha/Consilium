import type { Provider, ModelInfo } from '@/types'

export interface CatalogFetchResult {
  readonly provider: Provider
  readonly models: readonly ModelInfo[]
  readonly error?: string | undefined
}
