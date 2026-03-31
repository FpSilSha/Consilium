export type CatalogStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface PriceOverride {
  readonly input: number
  readonly output: number
}
