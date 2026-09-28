import type { ModelInfo } from '@/types'

export interface PricingEntry {
  readonly input: number
  readonly output: number
  readonly contextWindow: number
  readonly pricingKnown?: boolean | undefined
}

/** Provider-native Claude version separators differ from OpenRouter's IDs. */
export function nativeModelId(openRouterId: string): string | undefined {
  const slash = openRouterId.indexOf('/')
  if (slash < 0 || openRouterId.includes(':')) return undefined
  const author = openRouterId.slice(0, slash)
  const id = openRouterId.slice(slash + 1)
  if (!['anthropic', 'openai', 'google', 'x-ai', 'deepseek'].includes(author)) return undefined
  return author === 'anthropic' ? id.replace(/(\d)\.(\d)/g, '$1-$2') : id
}

export function buildPricingIndex(models: readonly ModelInfo[]): ReadonlyMap<string, PricingEntry> {
  const index = new Map<string, PricingEntry>()
  for (const model of models) {
    const entry: PricingEntry = {
      input: model.inputPricePerToken, output: model.outputPricePerToken,
      contextWindow: model.contextWindow, pricingKnown: model.pricingKnown !== false,
    }
    index.set(model.id, entry)
    const slash = model.id.indexOf('/')
    const suffix = slash < 0 ? undefined : model.id.slice(slash + 1)
    if (suffix != null && !index.has(suffix)) index.set(suffix, entry)
    const native = nativeModelId(model.id)
    if (native != null && !index.has(native)) index.set(native, entry)
    // This is a stable, documented Anthropic snapshot ID, not a guessed alias.
    if (native === 'claude-haiku-4-5') index.set('claude-haiku-4-5-20251001', entry)
  }
  return index
}
